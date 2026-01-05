import { NextRequest, NextResponse } from 'next/server';
import { isValidEthereumAddress } from '@/lib/vault-utils';
import { isValidChainId } from '@/lib/api-utils';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { searchParams } = new URL(request.url);
  const chainIdParam = searchParams.get('chainId') || '8453';
  const userAddress = searchParams.get('userAddress');
  
  let address: string | undefined;
  try {
    const resolvedParams = await params;
    address = resolvedParams.address;

    // Validate inputs
    if (!isValidEthereumAddress(address)) {
      return NextResponse.json(
        { 
          transactions: [],
          deposits: [],
          withdrawals: [],
          events: [],
          error: 'Invalid vault address format'
        },
        { status: 400 }
      );
    }

    if (!isValidChainId(chainIdParam)) {
      return NextResponse.json(
        { 
          transactions: [],
          deposits: [],
          withdrawals: [],
          events: [],
          error: 'Invalid chain ID'
        },
        { status: 400 }
      );
    }

    if (userAddress && !isValidEthereumAddress(userAddress)) {
      return NextResponse.json(
        { 
          transactions: [],
          deposits: [],
          withdrawals: [],
          events: [],
          error: 'Invalid user address format'
        },
        { status: 400 }
      );
    }

    // V2 vaults do not expose transaction history data yet
    // Return empty transactions with message
    return NextResponse.json({
      transactions: [],
      deposits: [],
      withdrawals: [],
      events: [],
      cached: false,
      timestamp: Date.now(),
      message: 'Historical transaction data is not yet available for V2 vaults',
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      }
    });

  } catch {
    return NextResponse.json(
      { 
        transactions: [],
        deposits: [],
        withdrawals: [],
        events: [],
        error: 'Failed to fetch vault activity data'
      },
      { status: 500 }
    );
  }
}
