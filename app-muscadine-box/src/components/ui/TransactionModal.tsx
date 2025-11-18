'use client';

import React, { useState, useEffect } from 'react';
import { useTransactionModal } from '../../contexts/TransactionModalContext';
import { useVaultTransactions } from '../../hooks/useVaultTransactions';
import { useWaitForTransactionReceipt } from 'wagmi';
import { useWallet } from '../../contexts/WalletContext';
import { useVaultData } from '../../contexts/VaultDataContext';
import { CloseIcon } from '../ui';
import Image from 'next/image';
import { getVaultLogo } from '../../types/vault';
import { formatSmartCurrency } from '../../lib/formatter';

export function TransactionModal() {
  const { 
    modalState, 
    closeTransactionModal, 
    updateTransactionStatus
  } = useTransactionModal();
  
  const { 
    withdrawAll, 
    withdrawAssets, 
    approveTokens, 
    executeDeposit, 
    checkApprovalNeeded, 
    isLoading 
  } = useVaultTransactions();
  
  const { morphoHoldings } = useWallet();
  const vaultDataContext = useVaultData();
  
  const [approvalStatus, setApprovalStatus] = useState<{
    needsApproval: boolean;
    currentAllowance: string;
    requiredAmount: string;
  } | null>(null);
  const [currentTxHash, setCurrentTxHash] = useState<string | null>(null);
  const [assetPrice, setAssetPrice] = useState<number | null>(null);
  const [isWaitingForApproval, setIsWaitingForApproval] = useState(false);
  const [approvalTxHash, setApprovalTxHash] = useState<string | null>(null);

  // Get vault data
  const vaultData = modalState.vaultAddress ? vaultDataContext.getVaultData(modalState.vaultAddress) : null;

  // Get current position
  const currentVaultPosition = modalState.vaultAddress
    ? morphoHoldings.positions.find(
        pos => pos.vault.address.toLowerCase() === modalState.vaultAddress!.toLowerCase()
      )
    : null;

  const userVaultValueUsd = currentVaultPosition ? 
    (parseFloat(currentVaultPosition.shares) / 1e18) * currentVaultPosition.vault.state.sharePriceUsd : 0;

  // Parse amount - handle string, number, or null
  // Trim whitespace and ensure it's a valid number
  const amountStr = modalState.amount?.toString().trim() || '';
  let amount = 0;
  if (amountStr) {
    const parsed = parseFloat(amountStr);
    amount = isNaN(parsed) ? 0 : parsed;
  }
  const amountUsd = assetPrice && amount > 0 ? amount * assetPrice : 0;

  // Debug: Log when modal opens
  useEffect(() => {
    if (modalState.isOpen) {
      console.log('TransactionModal opened:', {
        amount: modalState.amount,
        amountType: typeof modalState.amount,
        amountStr,
        parsedAmount: amount,
        vaultAddress: modalState.vaultAddress,
        type: modalState.type,
      });
    }
  }, [modalState.isOpen, modalState.amount, amountStr, amount, modalState.vaultAddress, modalState.type]);

  // Calculate balance after transaction
  const balanceBefore = userVaultValueUsd;
  let balanceAfter = userVaultValueUsd;
  if (modalState.type === 'deposit') {
    balanceAfter = userVaultValueUsd + amountUsd;
  } else if (modalState.type === 'withdraw' || modalState.type === 'withdrawAll') {
    balanceAfter = Math.max(0, userVaultValueUsd - amountUsd);
  }

  // Fetch asset price
  useEffect(() => {
    if (!modalState.vaultSymbol) return;
    
    const fetchAssetPrice = async () => {
      try {
        const symbolMap: Record<string, string> = {
          'cbBTC': 'BTC',
          'CBBTC': 'BTC',
          'CBTC': 'BTC',
          'WETH': 'ETH',
          'WBTC': 'BTC',
        };
        
        const vaultSymbol = modalState.vaultSymbol!.toUpperCase();
        const priceSymbol = symbolMap[vaultSymbol] || vaultSymbol;
        
        const response = await fetch(`/api/prices?symbols=${priceSymbol}`);
        if (response.ok) {
          const data = await response.json();
          const priceKey = priceSymbol.toLowerCase();
          const price = data[priceKey];
          
          if (price && typeof price === 'number' && price > 0) {
            setAssetPrice(price);
          } else if (vaultSymbol === 'USDC' || vaultSymbol === 'USDT' || vaultSymbol === 'DAI') {
            setAssetPrice(1);
          }
        }
      } catch (error) {
        console.error('Failed to fetch asset price:', error);
        if (modalState.vaultSymbol?.toUpperCase() === 'USDC' || 
            modalState.vaultSymbol?.toUpperCase() === 'USDT' || 
            modalState.vaultSymbol?.toUpperCase() === 'DAI') {
          setAssetPrice(1);
        }
      }
    };

    fetchAssetPrice();
  }, [modalState.vaultSymbol]);

  // Check approval status for deposits
  useEffect(() => {
    if (modalState.isOpen && modalState.type === 'deposit' && modalState.vaultAddress && modalState.amount) {
      const checkStatus = async () => {
        try {
          const status = await checkApprovalNeeded(modalState.vaultAddress!, modalState.amount!);
          setApprovalStatus(status);
        } catch (error) {
          console.error('Failed to check approval status:', error);
        }
      };
      
      checkStatus();
    }
  }, [modalState.isOpen, modalState.type, modalState.vaultAddress, modalState.amount, checkApprovalNeeded]);

  // Wait for approval transaction receipt
  const { data: approvalReceipt, error: approvalError } = useWaitForTransactionReceipt({
    hash: approvalTxHash as `0x${string}`,
    query: {
      enabled: !!approvalTxHash && isWaitingForApproval,
    },
  });

  // Wait for main transaction receipt (deposit/withdraw)
  const { data: receipt, error: receiptError } = useWaitForTransactionReceipt({
    hash: currentTxHash as `0x${string}`,
    query: {
      enabled: !!currentTxHash && modalState.status === 'confirming' && !isWaitingForApproval,
    },
  });

  // Execute deposit after approval is confirmed
  const executeDepositAfterApproval = React.useCallback(async () => {
    if (!modalState.vaultAddress || !modalState.amount) return;
    
    try {
      console.log('Executing deposit after approval with amount:', modalState.amount);
      const depositHash = await executeDeposit(modalState.vaultAddress, modalState.amount);
      setCurrentTxHash(depositHash);
      updateTransactionStatus('confirming', undefined, depositHash);
    } catch (err) {
      console.error('Deposit failed after approval:', err);
      let errorMessage = 'Deposit failed';
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      updateTransactionStatus('error', errorMessage);
    }
  }, [modalState.vaultAddress, modalState.amount, executeDeposit, updateTransactionStatus]);

  // Handle approval receipt - when approval completes, execute deposit
  useEffect(() => {
    if (approvalReceipt && isWaitingForApproval && modalState.type === 'deposit') {
      console.log('Approval confirmed, now executing deposit...');
      setIsWaitingForApproval(false);
      setApprovalTxHash(null);
      
      // Now execute the deposit
      executeDepositAfterApproval();
    } else if (approvalError && isWaitingForApproval) {
      console.error('Approval failed:', approvalError);
      setIsWaitingForApproval(false);
      setApprovalTxHash(null);
      updateTransactionStatus('error', 'Approval transaction failed');
    }
  }, [approvalReceipt, approvalError, isWaitingForApproval, modalState.type, executeDepositAfterApproval, updateTransactionStatus]);

  // Handle main transaction receipt (deposit/withdraw) - only close after this
  useEffect(() => {
    if (receipt && modalState.status === 'confirming' && !isWaitingForApproval) {
      updateTransactionStatus('success', undefined, currentTxHash || undefined);
      setTimeout(() => {
        closeTransactionModal();
      }, 3000);
    } else if (receiptError && modalState.status === 'confirming' && !isWaitingForApproval) {
      updateTransactionStatus('error', 'Transaction failed or was reverted');
    }
  }, [receipt, receiptError, modalState.status, currentTxHash, isWaitingForApproval, updateTransactionStatus, closeTransactionModal]);

  // Execute transaction
  const handleConfirm = async () => {
    if (!modalState.vaultAddress || !modalState.amount) return;

    try {
      updateTransactionStatus('confirming');
      
      console.log('handleConfirm - Executing transaction:', {
        type: modalState.type,
        amount: modalState.amount,
        vaultAddress: modalState.vaultAddress,
      });
      
      let txHash: string;

      if (modalState.type === 'deposit') {
        // Check if approval is needed
        if (approvalStatus?.needsApproval) {
          // First approve, then wait for approval before depositing
          console.log('Approving tokens with amount:', modalState.amount);
          txHash = await approveTokens(modalState.vaultAddress, modalState.amount);
          setApprovalTxHash(txHash);
          setIsWaitingForApproval(true);
          updateTransactionStatus('confirming', undefined, txHash);
          // Don't set currentTxHash yet - we'll set it after approval completes
          // The deposit will be executed in the useEffect when approval receipt is received
        } else {
          console.log('Executing deposit with amount:', modalState.amount);
          txHash = await executeDeposit(modalState.vaultAddress, modalState.amount);
          setCurrentTxHash(txHash);
        }
      } else if (modalState.type === 'withdraw') {
        // If amount is specified, withdraw that amount, otherwise withdraw all
        if (modalState.amount && parseFloat(modalState.amount) > 0) {
          console.log('Withdrawing assets with amount:', modalState.amount);
          txHash = await withdrawAssets(modalState.vaultAddress, modalState.amount);
        } else {
          console.log('Withdrawing all shares');
          txHash = await withdrawAll(modalState.vaultAddress);
        }
        setCurrentTxHash(txHash);
      } else if (modalState.type === 'withdrawAll') {
        console.log('Withdrawing assets with amount:', modalState.amount);
        txHash = await withdrawAssets(modalState.vaultAddress, modalState.amount);
        setCurrentTxHash(txHash);
      } else {
        throw new Error('Invalid transaction type');
      }
    } catch (err) {
      console.error('Transaction failed:', err);
      let errorMessage = 'Transaction failed';
      if (err instanceof Error) {
        errorMessage = err.message;
      }
      updateTransactionStatus('error', errorMessage);
    }
  };

  // Get exposure icons from vault data
  const getExposureAssets = () => {
    if (!vaultData?.marketAssets) return [];
    return vaultData.marketAssets.map(asset => asset.symbol);
  };

  const exposureAssets = getExposureAssets();

  if (!modalState.isOpen) {
    return null;
  }

  const isConfirming = modalState.status === 'confirming';
  const isSuccess = modalState.status === 'success';
  const isError = modalState.status === 'error';

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backgroundColor: 'var(--overlay)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <div 
        className="bg-[var(--surface-elevated)] rounded-lg border border-[var(--border-subtle)] w-full max-w-md mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--border-subtle)]">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">
            Review
          </h2>
          {!isConfirming && (
            <button
              onClick={closeTransactionModal}
              className="w-8 h-8 rounded-full bg-[var(--surface)] hover:bg-[var(--surface-hover)] flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <CloseIcon size="sm" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Success/Error States */}
          {isSuccess && (
            <div className="flex items-center justify-center gap-3 p-4 bg-[var(--success-subtle)] rounded-lg border border-[var(--success)]">
              <div className="w-8 h-8 rounded-full bg-[var(--success)] flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[var(--foreground)]">
                Transaction successful!
              </p>
            </div>
          )}

          {isError && (
            <div className="flex items-center justify-center gap-3 p-4 bg-[var(--danger-subtle)] rounded-lg border border-[var(--danger)]">
              <div className="w-8 h-8 rounded-full bg-[var(--danger)] flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[var(--foreground)]">
                {modalState.error || 'Transaction failed'}
              </p>
            </div>
          )}

          {isConfirming && (
            <div className="flex items-center justify-center gap-3 p-4 bg-[var(--surface)] rounded-lg">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--primary)]"></div>
              <p className="text-sm font-medium text-[var(--foreground)]">
                {isWaitingForApproval 
                  ? 'Approving tokens, waiting for confirmation...'
                  : modalState.type === 'deposit'
                    ? 'Executing deposit, waiting for confirmation...'
                    : 'Transaction submitted, waiting for confirmation...'
                }
              </p>
            </div>
          )}

          {/* Preview Content */}
          {modalState.status === 'preview' && (
            <>
              {/* Vault Info */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center overflow-hidden">
                  <Image 
                    src={getVaultLogo(modalState.vaultSymbol || '')} 
                    alt={`${modalState.vaultSymbol} logo`}
                    width={40}
                    height={40}
                    className={`w-full h-full object-contain ${
                      modalState.vaultSymbol === 'WETH' ? 'scale-75' : ''
                    }`}
                  />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-[var(--foreground)]">
                    {modalState.vaultName}
                  </h3>
                </div>
              </div>

              {/* Transaction Type */}
              <div>
                <p className="text-sm text-[var(--foreground-secondary)] mb-1">
                  {modalState.type === 'deposit' ? 'Deposit' : 'Withdraw'}
                </p>
              </div>

              {/* Amount */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-semibold text-[var(--foreground)]">
                    {amount > 0 ? amount.toFixed(6) : (modalState.amount || '0.000000')} {modalState.vaultSymbol}
                  </span>
                  {amountUsd > 0 && (
                    <span className="text-lg text-[var(--foreground-secondary)]">
                      {formatSmartCurrency(amountUsd)}
                    </span>
                  )}
                </div>
              </div>

              {/* Balance Change */}
              <div className="bg-[var(--surface)] rounded-lg p-4 space-y-2">
                <p className="text-sm text-[var(--foreground-secondary)]">
                  Deposit ({modalState.vaultSymbol})
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-semibold text-[var(--foreground)]">
                    {formatSmartCurrency(balanceBefore)}
                  </span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="w-4 h-4 text-[var(--foreground-secondary)]"
                  >
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                  <span className="text-lg font-semibold text-[var(--foreground)]">
                    {formatSmartCurrency(balanceAfter)}
                  </span>
                </div>
              </div>

              {/* APY */}
              {vaultData && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[var(--foreground-secondary)]">APY</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="w-4 h-4 text-[var(--foreground-secondary)]"
                    >
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                  </div>
                  <span className="text-lg font-semibold text-[var(--foreground)]">
                    {(vaultData.apy * 100).toFixed(2)}%
                  </span>
                </div>
              )}

              {/* Exposure */}
              {exposureAssets.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--foreground-secondary)]">Exposure</span>
                  <div className="flex items-center gap-2">
                    {exposureAssets.map((asset, idx) => (
                      <div
                        key={idx}
                        className="w-6 h-6 rounded-full bg-white flex items-center justify-center overflow-hidden"
                      >
                        <Image
                          src={getVaultLogo(asset)}
                          alt={asset}
                          width={24}
                          height={24}
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              <div className="pt-4 border-t border-[var(--border-subtle)]">
                <p className="text-xs text-[var(--foreground-secondary)] leading-relaxed">
                  By confirming this transaction, you agree to the{' '}
                  <a 
                    href="#" 
                    className="text-[var(--primary)] hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      // Open terms of use
                    }}
                  >
                    Terms of Use
                  </a>
                  {' '}and the services provisions relating to the Morpho Vault.
                </p>
              </div>
            </>
          )}

          {/* Transaction Hash */}
          {currentTxHash && (
            <div className="p-4 bg-[var(--surface)] rounded-lg">
              <p className="text-xs text-[var(--foreground-secondary)] mb-1">Transaction Hash</p>
              <p className="text-sm font-mono text-[var(--foreground)] break-all">
                {currentTxHash}
              </p>
            </div>
          )}

          {/* Confirm Button */}
          {modalState.status === 'preview' && (
            <button
              onClick={handleConfirm}
              disabled={isLoading || !modalState.amount || amount <= 0}
              className="w-full px-4 py-3 bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Processing...' : 'Confirm'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}