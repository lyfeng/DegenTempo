const API_BASE = '/api';

export async function loginUser(fid: string, walletAddress: string, eoaAddress?: string) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fid, walletAddress, eoaAddress }),
  });
  return res.json();
}

export async function getUserStats(fid: string) {
  const res = await fetch(`${API_BASE}/user/stats?fid=${encodeURIComponent(fid)}`);
  return res.json();
}

export async function submitTrade(fid: string, amount: string, userOpHash: string, outputAmount?: string) {
  const res = await fetch(`${API_BASE}/trade/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fid, amount, userOpHash, outputAmount }),
  });
  return res.json();
}

export async function connectStripe(fid: string) {
  try {
    const res = await fetch(`${API_BASE}/user/stripe/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fid }),
    });
    
    const data = await res.json();
    console.log("[API] connectStripe response:", { status: res.status, data });
    return data;
  } catch (error) {
    console.error("[API] connectStripe error:", error);
    throw error;
  }
}

export async function getTradeHistory(fid: string) {
  const res = await fetch(`${API_BASE}/trade/history?fid=${encodeURIComponent(fid)}`);
  return res.json();
}

export async function createPayout(fid: string, amount: string, txHash?: string) {
  const res = await fetch(`${API_BASE}/payout/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fid, amount, txHash }),
  });
  return res.json();
}
