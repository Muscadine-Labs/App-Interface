import { NextResponse } from 'next/server';

// In-memory cache for prices
let cachedPrices = {
  bitcoin: null as number | null,
  ethereum: null as number | null,
  lastUpdated: 0,
};

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  const now = Date.now();
  
  // Return cached data if it's still fresh
  if (cachedPrices.lastUpdated && (now - cachedPrices.lastUpdated) < CACHE_DURATION) {
    return NextResponse.json({
      bitcoin: cachedPrices.bitcoin,
      ethereum: cachedPrices.ethereum,
      cached: true,
    });
  }

  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd', {
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      // If API fails but we have cached data, return cached data
      if (cachedPrices.lastUpdated > 0) {
        return NextResponse.json({
          bitcoin: cachedPrices.bitcoin,
          ethereum: cachedPrices.ethereum,
          cached: true,
          error: 'API failed, using cached data',
        });
      }
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Update cache
    cachedPrices = {
      bitcoin: data.bitcoin?.usd || null,
      ethereum: data.ethereum?.usd || null,
      lastUpdated: now,
    };
    
    return NextResponse.json({
      bitcoin: cachedPrices.bitcoin,
      ethereum: cachedPrices.ethereum,
      cached: false,
    });
  } catch (error) {
    console.error('Price API error:', error);
    
    // If we have cached data, return it even if it's stale
    if (cachedPrices.lastUpdated > 0) {
      return NextResponse.json({
        bitcoin: cachedPrices.bitcoin,
        ethereum: cachedPrices.ethereum,
        cached: true,
        error: 'API failed, using stale cached data',
      });
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch prices and no cached data available' },
      { status: 500 }
    );
  }
}
