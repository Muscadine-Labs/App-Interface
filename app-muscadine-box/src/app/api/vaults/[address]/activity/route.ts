import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { searchParams } = new URL(request.url);
  const chainId = searchParams.get('chainId') || '8453';
  const userAddress = searchParams.get('userAddress'); // Optional: filter by user
  const { address } = await params;

  try {
    const escapedAddress = address.replace(/"/g, '\\"');
    const escapedUserAddress = userAddress ? userAddress.replace(/"/g, '\\"') : null;
    const whereClause = [
      `vaultAddress_in: ["${escapedAddress}"]`,
      `type_in: [MetaMorphoDeposit, MetaMorphoWithdraw]`,
      ...(escapedUserAddress ? [`userAddress_in: ["${escapedUserAddress}"]`] : [])
    ].join(', ');

    const query = `
      query VaultActivity {
        transactions(
          first: 100
          orderBy: Timestamp
          orderDirection: Desc
          where: { 
            ${whereClause}
          }
        ) {
          items {
            hash
            timestamp
            type
            blockNumber
            chain {
              id
              network
            }
            user {
              address
            }
            data {
              ... on VaultTransactionData {
                shares
                assets
                vault {
                  address
                }
              }
            }
          }
        }
      }
    `;

    const response = await fetch('https://api.morpho.org/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
      }),
      next: { 
        revalidate: 60, // 1 minute - activity data changes frequently
      },
    });

    const responseText = await response.text();
    let data;
    
    try {
      data = JSON.parse(responseText);
    } catch {
      console.error('Failed to parse API response:', responseText);
      throw new Error(`Morpho API error: ${response.status} - Invalid JSON response`);
    }

    if (!response.ok) {
      console.error('API Error Response:', data);
      throw new Error(`Morpho API error: ${response.status} - ${data.errors?.[0]?.message || responseText}`);
    }

    if (data.errors) {
      console.error('GraphQL errors:', data.errors[0]?.message || 'Unknown error');
      return NextResponse.json({
        transactions: [],
        deposits: [],
        withdrawals: [],
        events: [],
        error: data.errors[0]?.message || 'GraphQL query failed',
        cached: false,
        timestamp: Date.now(),
      });
    }

    const vaultV1Txs = data.data?.transactions?.items || [];
    let assetPrice = 1; // Default to 1 for stablecoins
    let assetDecimals = 18; // Default decimals
    
    try {
      const vaultQuery = `
        query VaultAssetInfo($address: String!, $chainId: Int!) {
          vaultByAddress(address: $address, chainId: $chainId) {
            asset {
              symbol
              decimals
              priceUsd
            }
          }
        }
      `;
      
      const vaultResponse = await fetch('https://api.morpho.org/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          query: vaultQuery,
          variables: {
            address,
            chainId: parseInt(chainId),
          },
        }),
      });
      
      if (vaultResponse.ok) {
        const vaultData = await vaultResponse.json();
        const vaultInfo = vaultData.data?.vaultByAddress;
        if (vaultInfo?.asset) {
          assetDecimals = vaultInfo.asset.decimals || 18;
          assetPrice = vaultInfo.asset.priceUsd || 1;
          
          if (!vaultInfo.asset.priceUsd) {
            const symbol = vaultInfo.asset.symbol || '';
            if (symbol && symbol.toUpperCase() !== 'USDC' && symbol.toUpperCase() !== 'USDT' && symbol.toUpperCase() !== 'DAI') {
              try {
                const priceUrl = new URL('/api/prices', request.url);
                priceUrl.searchParams.set('symbols', symbol);
                const priceResponse = await fetch(priceUrl.toString());
                if (priceResponse.ok) {
                  const priceData = await priceResponse.json();
                  const priceKey = symbol.toLowerCase();
                  assetPrice = priceData[priceKey] || 1;
                }
              } catch (e) {
                console.warn('Failed to fetch asset price:', e);
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('Failed to fetch vault info for USD calculation:', e);
    }

    interface Transaction {
      id: string;
      type: 'deposit' | 'withdraw' | 'event';
      timestamp: number;
      blockNumber?: number;
      transactionHash?: string;
      user?: string;
      assets?: string;
      shares?: string;
      assetsUsd?: number;
    }

    const transactions: Transaction[] = vaultV1Txs.map((tx: any) => {
      let assetsUsd = tx.data?.assetsUsd;
      
      if (!assetsUsd && tx.data?.assets) {
        try {
          const assetsBigInt = BigInt(tx.data.assets || '0');
          const assetsDecimal = Number(assetsBigInt) / Math.pow(10, assetDecimals);
          assetsUsd = assetsDecimal * assetPrice;
        } catch (e) {
          console.warn('Failed to calculate USD value:', e);
          assetsUsd = 0;
        }
      }
      
      return {
        id: tx.hash,
        type: tx.type === 'MetaMorphoDeposit' ? 'deposit' as const : 
              tx.type === 'MetaMorphoWithdraw' ? 'withdraw' as const : 
              'event' as const,
        timestamp: tx.timestamp,
        blockNumber: tx.blockNumber,
        transactionHash: tx.hash,
        user: tx.user?.address,
        assets: tx.data?.assets,
        shares: tx.data?.shares,
        assetsUsd: assetsUsd || 0,
      };
    })
      .filter((tx: Transaction) => tx.transactionHash)
      .sort((a: Transaction, b: Transaction) => (b.timestamp || 0) - (a.timestamp || 0));

    const deposits = transactions.filter((tx: Transaction) => tx.type === 'deposit');
    const withdrawals = transactions.filter((tx: Transaction) => tx.type === 'withdraw');
    const events = transactions.filter((tx: Transaction) => tx.type !== 'deposit' && tx.type !== 'withdraw');

    return NextResponse.json({
      transactions,
      deposits,
      withdrawals,
      events,
      cached: false,
      timestamp: Date.now(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      }
    });

  } catch (error) {
    console.error('Vault activity API error:', error);
    return NextResponse.json(
      { 
        transactions: [],
        deposits: [],
        withdrawals: [],
        events: [],
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 200 } // Return 200 with empty data rather than error
    );
  }
}

