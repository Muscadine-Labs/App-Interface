import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { searchParams } = new URL(request.url);
  const chainId = searchParams.get('chainId') || '8453';
  const period = searchParams.get('period') || '30d'; // 7d, 30d, 90d, 1y
  const { address } = await params;

  try {
    // Calculate time range based on period
    const now = Math.floor(Date.now() / 1000);
    const periodSeconds: Record<string, number> = {
      '7d': 7 * 24 * 60 * 60,
      '30d': 30 * 24 * 60 * 60,
      '90d': 90 * 24 * 60 * 60,
      '1y': 365 * 24 * 60 * 60,
    };
    const startTime = now - (periodSeconds[period] || periodSeconds['30d']);

    // Determine interval based on period
    const intervalMap: Record<string, string> = {
      '7d': 'HOUR',
      '30d': 'DAY',
      '90d': 'DAY',
      '1y': 'DAY',
    };
    const interval = intervalMap[period] || 'DAY';

    const query = `
      query VaultHistory($address: String!, $chainId: Int!, $options: TimeseriesOptions) {
        vaultByAddress(address: $address, chainId: $chainId) {
          address
          historicalState {
            apy(options: $options) {
              x
              y
            }
            netApy(options: $options) {
              x
              y
            }
            totalAssetsUsd(options: $options) {
              x
              y
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
        variables: {
          address,
          chainId: parseInt(chainId),
          options: {
            startTimestamp: startTime,
            endTimestamp: now,
            interval: interval,
          },
        },
      }),
      next: { 
        revalidate: 300, // 5 minutes - historical data changes less frequently
      },
    });

    if (!response.ok) {
      throw new Error(`Morpho API error: ${response.status}`);
    }

    const data = await response.json();

    // Check if errors are about historical data not being available
    const hasNotFoundError = data.errors?.some((err: any) => 
      err.status === 'NOT_FOUND' || err.message?.includes('No results matching')
    );
    
    if (data.errors && !hasNotFoundError) {
      console.error('GraphQL errors:', data.errors[0]?.message || 'Unknown error');
      return NextResponse.json({
        history: [],
        period,
        cached: false,
        timestamp: Date.now(),
        error: data.errors[0]?.message || 'GraphQL query failed',
      });
    }

    const vaultV1 = data.data?.vaultByAddress;
    
    if (!vaultV1 || !vaultV1.historicalState) {
      return NextResponse.json({
        history: [],
        period,
        cached: false,
        timestamp: Date.now(),
      });
    }
    
    const apyData = vaultV1.historicalState.apy || [];
    const netApyData = vaultV1.historicalState.netApy || [];
    const totalAssetsUsdData = vaultV1.historicalState.totalAssetsUsd || [];

    const timestamps = new Set<number>();
    apyData.forEach((point: { x: number; y: number }) => timestamps.add(point.x));
    netApyData.forEach((point: { x: number; y: number }) => timestamps.add(point.x));
    totalAssetsUsdData.forEach((point: { x: number; y: number }) => timestamps.add(point.x));

    const apyMap = new Map(apyData.map((p: { x: number; y: number }) => [p.x, p.y]));
    const netApyMap = new Map(netApyData.map((p: { x: number; y: number }) => [p.x, p.y]));
    const totalAssetsUsdMap = new Map(totalAssetsUsdData.map((p: { x: number; y: number }) => [p.x, p.y]));

    const history = Array.from(timestamps)
      .sort((a, b) => a - b)
      .map((timestamp) => {
        const apy = apyMap.get(timestamp) || 0;
        const netApy = netApyMap.get(timestamp) || 0;
        const totalAssetsUsd = totalAssetsUsdMap.get(timestamp) || 0;
        const apyValue = typeof apy === 'number' ? apy : 0;
        const netApyValue = typeof netApy === 'number' ? netApy : 0;

        return {
          timestamp,
          date: new Date(timestamp * 1000).toISOString().split('T')[0],
          totalAssetsUsd,
          apy: apyValue * 100,
          netApy: netApyValue * 100,
        };
      });

    return NextResponse.json({
      history,
      period,
      cached: false,
      timestamp: Date.now(),
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      }
    });

  } catch (error) {
    console.error('Vault history API error:', error);
    return NextResponse.json(
      { 
        history: [],
        period,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 200 } // Return 200 with empty data rather than error
    );
  }
}

