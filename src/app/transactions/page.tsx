'use client';

import { useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAccount, useReadContract } from 'wagmi';
import { AccountSelector, TransactionFlow, TransactionProgressBar } from '@/components/features/transactions';
import { useTransactionState } from '@/contexts/TransactionContext';
import { useWallet } from '@/contexts/WalletContext';
import { useVaultData } from '@/contexts/VaultDataContext';
import { usePrices } from '@/app/PriceContext';
import { VAULTS } from '@/lib/vaults';
import { VaultAccount, WalletAccount } from '@/types/vault';
import { formatBigIntForInput, formatWalletBalance, formatVaultAssetBalance, formatAvailableBalance, formatAssetAmountForMax } from '@/lib/formatter';
import { Button } from '@/components/ui';
import { formatUnits, parseUnits } from 'viem';
import { BASE_WETH_ADDRESS } from '@/lib/constants';

// ERC-4626 ABI for convertToAssets
const ERC4626_ABI = [
  {
    inputs: [{ internalType: 'uint256', name: 'shares', type: 'uint256' }],
    name: 'convertToAssets',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export default function TransactionsPage() {
  const { isConnected } = useAccount();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { tokenBalances, ethBalance, morphoHoldings } = useWallet();
  const vaultDataContext = useVaultData();
  const { btc: btcPrice, eth: ethPrice } = usePrices();
  const {
    fromAccount,
    toAccount,
    amount,
    status,
    derivedAsset,
    setFromAccount,
    setToAccount,
    setAmount,
    setStatus,
    reset,
  } = useTransactionState();

  // Handle URL params for pre-filling vault (when navigating from vault page)
  useEffect(() => {
    const vaultAddress = searchParams.get('vault');
    const action = searchParams.get('action'); // 'deposit' or 'withdraw'

    if (vaultAddress && action) {
      const vault = Object.values(VAULTS).find((v) => v.address.toLowerCase() === vaultAddress.toLowerCase());
      if (vault) {
        const vaultData = vaultDataContext.getVaultData(vault.address);
        const position = morphoHoldings.positions.find(
          (pos) => pos.vault.address.toLowerCase() === vault.address.toLowerCase()
        );

        const vaultAccount: VaultAccount = {
          type: 'vault',
          address: vault.address,
          name: vault.name,
          symbol: vault.symbol,
          balance: position ? BigInt(position.shares) : BigInt(0),
          assetAddress: '', // Will be fetched during transaction
          assetDecimals: vaultData?.assetDecimals ?? 18,
        };

        if (action === 'deposit') {
          // Pre-fill wallet as "from" and vault as "to"
          const walletAccount: WalletAccount = {
            type: 'wallet',
            address: 'wallet',
            symbol: vault.symbol,
            balance: BigInt(0),
          };
          setFromAccount(walletAccount);
          setToAccount(vaultAccount);
        } else if (action === 'withdraw') {
          // Pre-fill vault as "from" and wallet as "to"
          const walletAccount: WalletAccount = {
            type: 'wallet',
            address: 'wallet',
            symbol: vault.symbol,
            balance: BigInt(0),
          };
          setFromAccount(vaultAccount);
          setToAccount(walletAccount);
        }

        // Keep status as 'idle' so user stays on select page and can modify before proceeding
      }
    }
  }, [searchParams, vaultDataContext, morphoHoldings, setFromAccount, setToAccount]);

  // Get vault position for convertToAssets call
  const vaultPosition = fromAccount?.type === 'vault' 
    ? morphoHoldings.positions.find(
        (pos) => pos.vault.address.toLowerCase() === (fromAccount as VaultAccount).address.toLowerCase()
      )
    : null;

  // Use convertToAssets contract call if position.assets is not available
  const { data: withdrawableAssetsBigInt } = useReadContract({
    address: (fromAccount?.type === 'vault' && !vaultPosition?.assets ? (fromAccount as VaultAccount).address : undefined) as `0x${string}`,
    abi: ERC4626_ABI,
    functionName: 'convertToAssets',
    args: vaultPosition && !vaultPosition.assets && fromAccount?.type === 'vault'
      ? [BigInt(vaultPosition.shares)]
      : undefined,
    query: {
      enabled: fromAccount?.type === 'vault' && !!vaultPosition && !vaultPosition.assets,
    },
  });

  // Helper function to get combined ETH + WETH balance for WETH vault deposits
  const getCombinedEthWethBalance = (): number => {
    const ethBal = parseFloat(ethBalance || '0');
    const wethToken = tokenBalances.find((t) => t.symbol.toUpperCase() === 'WETH');
    const wethBal = wethToken ? parseFloat(wethToken.formatted || '0') : 0;
    
    // Reserve gas fees when wrapping
    // For larger amounts, reserve 0.0001 ETH; for small amounts, reserve less
    const gasReserve = ethBal > 0.0001 ? 0.0001 : (ethBal > 0.00005 ? 0.00005 : 0);
    const wrappableEth = ethBal > gasReserve ? ethBal - gasReserve : 0;
    
    // Total available: existing WETH + wrappable ETH (ETH that can actually be wrapped)
    return wethBal + wrappableEth;
  };

  // Get max amount as a number for validation
  const getMaxAmount = (): number | null => {
    if (!fromAccount || !derivedAsset) return null;

    if (fromAccount.type === 'wallet') {
      const symbol = derivedAsset.symbol;
      // For WETH vault deposits, combine ETH + WETH balances
      if (toAccount?.type === 'vault') {
        const toVault = toAccount as VaultAccount;
        const isWethVault = toVault.address.toLowerCase() === VAULTS.WETH_VAULT.address.toLowerCase();
        
        if (isWethVault && (symbol === 'WETH' || symbol === 'ETH')) {
          return getCombinedEthWethBalance();
        }
      }
      
      if (symbol === 'WETH' || symbol === 'ETH') {
        return parseFloat(ethBalance || '0');
      } else {
        const token = tokenBalances.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
        if (token) {
          const decimals = token.decimals;
          return parseFloat(formatUnits(token.balance, decimals));
        }
      }
    } else {
      // For vault withdrawals, use position.assets or convertToAssets contract call
      const vaultAccount = fromAccount as VaultAccount;
      const vaultData = vaultDataContext.getVaultData(vaultAccount.address);
      const position = vaultPosition;

      if (position && vaultData) {
        // First priority: Use position.assets if available (from GraphQL)
        if (position.assets) {
          return parseFloat(position.assets) / Math.pow(10, vaultData.assetDecimals || 18);
        } 
        // Second priority: Use convertToAssets contract call result
        else if (withdrawableAssetsBigInt !== undefined) {
          return parseFloat(formatUnits(withdrawableAssetsBigInt, vaultData.assetDecimals || 18));
        }
      }
    }
    return null;
  };

  // Calculate max amount for the selected "from" account
  const calculateMaxAmount = () => {
    if (!fromAccount || !derivedAsset) return;

    if (fromAccount.type === 'wallet') {
      const symbol = derivedAsset.symbol;
      // For WETH vault deposits, combine ETH + WETH balances
      if (toAccount?.type === 'vault') {
        const toVault = toAccount as VaultAccount;
        const isWethVault = toVault.address.toLowerCase() === VAULTS.WETH_VAULT.address.toLowerCase();
        
        if (isWethVault && (symbol === 'WETH' || symbol === 'ETH')) {
          const combinedBal = getCombinedEthWethBalance();
          setAmount(combinedBal > 0 ? formatAssetAmountForMax(combinedBal, 'WETH') : '0');
          return;
        }
      }
      
      if (symbol === 'WETH' || symbol === 'ETH') {
        const ethBal = parseFloat(ethBalance || '0');
        setAmount(ethBal > 0 ? formatAssetAmountForMax(ethBal, symbol) : '0');
      } else {
        const token = tokenBalances.find((t) => t.symbol.toUpperCase() === symbol.toUpperCase());
        if (token) {
          const decimals = token.decimals;
          setAmount(formatBigIntForInput(token.balance, decimals));
        }
      }
    } else {
      // For vault withdrawals, use position.assets or convertToAssets contract call
      const vaultAccount = fromAccount as VaultAccount;
      const vaultData = vaultDataContext.getVaultData(vaultAccount.address);
      const position = vaultPosition;

      if (position && vaultData) {
        let assetAmount: number | null = null;
        
        // First priority: Use position.assets if available (from GraphQL)
        if (position.assets) {
          assetAmount = parseFloat(position.assets) / Math.pow(10, vaultData.assetDecimals || 18);
        } 
        // Second priority: Use convertToAssets contract call result
        else if (withdrawableAssetsBigInt !== undefined) {
          assetAmount = parseFloat(formatUnits(withdrawableAssetsBigInt, vaultData.assetDecimals || 18));
        }
        
        if (assetAmount !== null) {
          const decimals = vaultData.assetDecimals || 18;
          setAmount(formatAssetAmountForMax(assetAmount, derivedAsset.symbol, decimals));
        }
      }
    }
  };

  const handleAmountChange = (value: string) => {
    if (value === '') {
      setAmount('');
      return;
    }
    
    if (!/^\d*\.?\d*$/.test(value)) {
      return;
    }
    
    // Validate against max amount
    const maxAmount = getMaxAmount();
    if (maxAmount !== null) {
      const numValue = parseFloat(value);
      if (!isNaN(numValue) && numValue > maxAmount) {
        // Cap the value at max amount
        const decimals = fromAccount?.type === 'vault' 
          ? (fromAccount as VaultAccount).assetDecimals ?? derivedAsset?.decimals ?? 18
          : derivedAsset?.decimals ?? 18;
        setAmount(formatAssetAmountForMax(maxAmount, derivedAsset?.symbol || '', decimals));
        return;
      }
    }
    
    setAmount(value);
  };

  const handleStartTransaction = () => {
    console.log('[TransactionsPage] handleStartTransaction called', {
      fromAccount: fromAccount?.type === 'wallet' ? 'wallet' : (fromAccount as VaultAccount)?.name,
      toAccount: toAccount?.type === 'wallet' ? 'wallet' : (toAccount as VaultAccount)?.name,
      derivedAsset,
      amount,
      amountType: typeof amount,
      amountLength: amount?.length,
      isEmpty: !amount || amount === '',
      parseFloatAmount: amount ? parseFloat(amount) : null,
    });
    if (fromAccount && toAccount && derivedAsset) {
      console.log('[TransactionsPage] Setting status to preview with amount:', amount);
      setStatus('preview');
    } else {
      console.log('[TransactionsPage] Missing required data:', {
        hasFromAccount: !!fromAccount,
        hasToAccount: !!toAccount,
        hasDerivedAsset: !!derivedAsset,
        amount,
      });
    }
  };

  const handleReset = () => {
    reset();
    router.push('/transactions');
  };

  if (!isConnected) {
    return (
      <div className="w-full max-w-2xl mx-auto p-6">
        <div className="bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] p-8 text-center">
          <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">
            Connect Your Wallet
          </h2>
          <p className="text-sm text-[var(--foreground-secondary)]">
            Please connect your wallet to start making transactions.
          </p>
        </div>
      </div>
    );
  }

  // Calculate progress bar steps based on status
  const getProgressSteps = () => {
    if (status === 'success') {
      return [
        { label: 'Select', completed: true, active: false },
        { label: 'Review', completed: true, active: false },
        { label: 'Confirmation', completed: true, active: false }
      ];
    }
    
    if (status === 'preview') {
      return [
        { label: 'Select', completed: true, active: false },
        { label: 'Review', completed: false, active: true },
        { label: 'Confirmation', completed: false, active: false }
      ];
    }
    
    if (status === 'signing' || status === 'approving' || status === 'confirming') {
      return [
        { label: 'Select', completed: true, active: false },
        { label: 'Review', completed: false, active: true },
        { label: 'Confirmation', completed: false, active: false }
      ];
    }
    
    // Idle state - user is selecting accounts/amount
    return [
      { label: 'Select', completed: false, active: true },
      { label: 'Review', completed: false, active: false },
      { label: 'Confirmation', completed: false, active: false }
    ];
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--foreground)] mb-2">
          Transfer Assets
        </h1>
        <p className="text-sm text-[var(--foreground-secondary)]">
          Move assets between your wallet and vaults, or transfer between vaults.
        </p>
      </div>

      {/* Overall Transaction Flow Progress Bar - Always visible */}
      <TransactionProgressBar steps={getProgressSteps()} isSuccess={status === 'success'} />

      {status === 'idle' && (
        <div className="bg-[var(--surface)] rounded-lg border border-[var(--border-subtle)] p-6 space-y-6">
          {/* From Account */}
          <AccountSelector
            label="From"
            selectedAccount={fromAccount}
            onSelect={(account) => {
              // If wallet is selected and it's already selected in "to", unselect it from "to"
              if (account?.type === 'wallet' && toAccount?.type === 'wallet') {
                setToAccount(null);
              }
              setFromAccount(account);
            }}
            excludeAccount={toAccount}
            assetSymbol={derivedAsset?.symbol || null}
          />

          {/* To Account */}
          <AccountSelector
            label="To"
            selectedAccount={toAccount}
            onSelect={(account) => {
              // If wallet is selected and it's already selected in "from", unselect it from "from"
              if (account?.type === 'wallet' && fromAccount?.type === 'wallet') {
                setFromAccount(null);
              }
              setToAccount(account);
            }}
            excludeAccount={fromAccount}
            filterByAssetSymbol={fromAccount?.type === 'vault' ? (fromAccount as VaultAccount).symbol : null}
            assetSymbol={derivedAsset?.symbol || null}
          />

          {/* Amount Input */}
          {fromAccount && derivedAsset && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[var(--foreground-secondary)]">
                  Amount ({derivedAsset.symbol})
                </label>
                <button
                  type="button"
                  onClick={calculateMaxAmount}
                  className="text-xs text-[var(--primary)] hover:text-[var(--primary-hover)]"
                >
                  MAX
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3 pr-24 bg-[var(--background)] border border-[var(--border-subtle)] rounded-lg text-[var(--foreground)] placeholder-[var(--foreground-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary)]"
                />
                {/* Dollar amount display for BTC/ETH vault transactions - inside input */}
                {(() => {
                  try {
                    // Early checks - return null for invalid states (not errors)
                    if (!fromAccount || !toAccount || !derivedAsset || !amount) return null;
                    
                    const amountNum = parseFloat(amount);
                    if (isNaN(amountNum) || amountNum <= 0) return null;
                    
                    // Determine which vault we're dealing with (could be from or to)
                    let vaultAddress: string | null = null;
                    if (toAccount.type === 'vault') {
                      const toVault = toAccount as VaultAccount;
                      if (toVault.address) {
                        vaultAddress = toVault.address.toLowerCase();
                      }
                    } else if (fromAccount.type === 'vault') {
                      const fromVault = fromAccount as VaultAccount;
                      if (fromVault.address) {
                        vaultAddress = fromVault.address.toLowerCase();
                      }
                    }
                    
                    // If no vault address found, no dollar estimate needed
                    if (!vaultAddress) return null;
                    
                    const btcVaultAddress = VAULTS.cbBTC_VAULT.address.toLowerCase();
                    const wethVaultAddress = VAULTS.WETH_VAULT.address.toLowerCase();
                    const isBtcVault = vaultAddress === btcVaultAddress;
                    const isWethVault = vaultAddress === wethVaultAddress;
                    
                    // Check if this is a BTC vault transaction
                    if (isBtcVault) {
                      if (!btcPrice || typeof btcPrice !== 'number' || btcPrice <= 0) {
                        console.warn('[Dollar Estimate] BTC vault detected but price not available', { btcPrice });
                        return null;
                      }
                      
                      const dollarAmount = amountNum * btcPrice;
                      if (isNaN(dollarAmount) || dollarAmount <= 0) {
                        console.warn('[Dollar Estimate] BTC vault - invalid calculation', { amountNum, btcPrice, dollarAmount });
                        return null;
                      }
                      
                      console.log('[Dollar Estimate] BTC vault - showing estimate', { amountNum, btcPrice, dollarAmount });
                      return (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                          <span className="text-sm text-[var(--foreground-muted)]">
                            ≈ ${dollarAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      );
                    }
                    
                    // Check if this is an ETH/WETH vault transaction
                    if (isWethVault) {
                      if (!ethPrice || typeof ethPrice !== 'number' || ethPrice <= 0) {
                        console.warn('[Dollar Estimate] WETH vault detected but price not available', { ethPrice });
                        return null;
                      }
                      
                      const dollarAmount = amountNum * ethPrice;
                      if (isNaN(dollarAmount) || dollarAmount <= 0) {
                        console.warn('[Dollar Estimate] WETH vault - invalid calculation', { amountNum, ethPrice, dollarAmount });
                        return null;
                      }
                      
                      console.log('[Dollar Estimate] WETH vault - showing estimate', { amountNum, ethPrice, dollarAmount });
                      return (
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                          <span className="text-sm text-[var(--foreground-muted)]">
                            ≈ ${dollarAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                      );
                    }
                    
                    // Not a BTC or WETH vault - no dollar estimate needed
                    return null;
                  } catch (error) {
                    console.error('[Dollar Estimate Error]', error);
                    // In development, you might want to show the error in the UI
                    // For now, just log it and return null
                    return null;
                  }
                })()}
              </div>
              {fromAccount && derivedAsset && (
                <p className="text-xs text-[var(--foreground-muted)]">
                  {fromAccount.type === 'wallet' 
                    ? (() => {
                        // For WETH vault deposits, show combined ETH + WETH balance
                        if (toAccount?.type === 'vault') {
                          const toVault = toAccount as VaultAccount;
                          const isWethVault = toVault.address.toLowerCase() === VAULTS.WETH_VAULT.address.toLowerCase();
                          
                          if (isWethVault && (derivedAsset.symbol === 'WETH' || derivedAsset.symbol === 'ETH')) {
                            const combinedBal = getCombinedEthWethBalance();
                            const ethBal = parseFloat(ethBalance || '0');
                            const wethToken = tokenBalances.find((t) => t.symbol.toUpperCase() === 'WETH');
                            const wethBal = wethToken ? parseFloat(wethToken.formatted || '0') : 0;
                            
                            // Format the combined balance display
                            if (wethBal > 0 && ethBal > 0) {
                              return `Available: ${formatAvailableBalance(combinedBal, 'WETH')} (${formatAvailableBalance(wethBal, 'WETH')} WETH + ${formatAvailableBalance(ethBal, 'ETH')} wrappable)`;
                            } else if (wethBal > 0) {
                              return formatAvailableBalance(wethBal, 'WETH');
                            } else if (ethBal > 0) {
                              return `Available: ${formatAvailableBalance(ethBal, 'ETH')} (wrappable to WETH)`;
                            } else {
                              return formatAvailableBalance('0', 'WETH');
                            }
                          }
                        }
                        
                        if (derivedAsset.symbol === 'ETH' || derivedAsset.symbol === 'WETH') {
                          return formatAvailableBalance(ethBalance || '0', derivedAsset.symbol);
                        } else {
                          const token = tokenBalances.find((t) => t.symbol.toUpperCase() === derivedAsset.symbol.toUpperCase());
                          return formatAvailableBalance(token?.formatted || '0', derivedAsset.symbol);
                        }
                      })()
                    : (() => {
                        // For vault, use position.assets or convertToAssets contract call
                        const vaultAccount = fromAccount as VaultAccount;
                        const vaultData = vaultDataContext.getVaultData(vaultAccount.address);
                        const position = morphoHoldings.positions.find(
                          (pos) => pos.vault.address.toLowerCase() === vaultAccount.address.toLowerCase()
                        );

                        if (position && vaultData) {
                          let assetAmount: number | null = null;
                          
                          // First priority: Use position.assets if available (from GraphQL)
                          if (position.assets) {
                            assetAmount = parseFloat(position.assets) / Math.pow(10, vaultData.assetDecimals || 18);
                          }
                          // Second priority: Use convertToAssets contract call result (if available)
                          else if (withdrawableAssetsBigInt !== undefined && fromAccount.type === 'vault' && (fromAccount as VaultAccount).address.toLowerCase() === vaultAccount.address.toLowerCase()) {
                            assetAmount = parseFloat(formatUnits(withdrawableAssetsBigInt, vaultData.assetDecimals || 18));
                          }
                          
                          if (assetAmount !== null) {
                            return formatAvailableBalance(assetAmount, derivedAsset.symbol, vaultData.assetDecimals || 18);
                          }
                        }
                        return `Available: 0.00 ${derivedAsset.symbol}`;
                      })()
                  }
                </p>
              )}
            </div>
          )}

          {/* Validation message */}
          {fromAccount && toAccount && fromAccount.type === 'wallet' && toAccount.type === 'wallet' && (
            <div className="p-4 bg-[var(--warning-subtle)] rounded-lg border border-[var(--warning)]">
              <p className="text-sm text-[var(--foreground)]">
                Wallet-to-wallet transactions are not allowed. Please select a vault for one of the accounts.
              </p>
            </div>
          )}

          {/* Start Transaction Button */}
          <Button
            onClick={handleStartTransaction}
            disabled={
              !fromAccount || 
              !toAccount || 
              !derivedAsset || 
              !amount || 
              parseFloat(amount) <= 0 ||
              (fromAccount.type === 'wallet' && toAccount.type === 'wallet') // Prevent wallet-to-wallet
            }
            variant="primary"
            size="lg"
            fullWidth
          >
            Continue
          </Button>
        </div>
      )}

      {/* Transaction Flow (Preview, Progress, Success, Error) */}
      {(() => {
        const shouldRenderFlow = status === 'preview' || status === 'signing' || status === 'approving' || status === 'confirming' || status === 'success' || status === 'error';
        if (shouldRenderFlow) {
          console.log('[TransactionsPage] Rendering TransactionFlow with status:', status);
        }
        return shouldRenderFlow;
      })() && (
        <>
          <TransactionFlow
            onSuccess={() => {
              setTimeout(() => {
                handleReset();
              }, 3000);
            }}
          />
          {status !== 'signing' && status !== 'approving' && status !== 'confirming' && (
            <Button
              onClick={handleReset}
              variant="secondary"
              size="lg"
              fullWidth
            >
              {status === 'success' ? 'New Transaction' : 'Start Over'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
