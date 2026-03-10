// api/ah-debug.js — TEMPORARY debug endpoint, delete after fixing price
const AH_PROGRAM = 'hausS13jsjafwWwGqZTUQRmWyvyxn9EQpqMwV1PBBmk';
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58Encode(u8){let n=0n;for(const b of u8)n=n*256n+BigInt(b);let s='';while(n>0n){s=B58[Number(n%58n)]+s;n/=58n;}for(const b of u8){if(b)break;s='1'+s;}return s;}

async function rpc(endpoint, method, params) {
  const r = await fetch(endpoint, {method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:'1',method,params})});
  const {result,error} = await r.json();
  if(error) throw new Error(JSON.stringify(error));
  return result;
}

export default async function handler(req, res) {
  const endpoint = process.env.SOLANA_RPC_URL;
  const ahAddr   = process.env.AUCTION_HOUSE_ADDRESS;

  // Fetch listing receipts
  const receipts = await rpc(endpoint, 'getProgramAccounts', [AH_PROGRAM, {
    encoding:'base64',
    filters:[{dataSize:236},{memcmp:{offset:72,bytes:ahAddr}}]
  }]);

  const out = await Promise.all((receipts||[]).map(async acct => {
    const data = Buffer.from(acct.account.data[0],'base64');
    const tradeState = b58Encode(data.slice(8,40));
    const seller     = b58Encode(data.slice(104,136));
    const purchaseTag = data[168];

    // Fetch the trade state account
    const tsAcct = await rpc(endpoint, 'getAccountInfo', [tradeState, {encoding:'base64'}]);
    const tsData = tsAcct?.value?.data ? Buffer.from(tsAcct.value.data[0],'base64') : null;

    return {
      receipt: acct.pubkey,
      tradeState,
      seller,
      purchaseTag,
      receiptHex: data.toString('hex'),
      tradeStateLamports: tsAcct?.value?.lamports,
      tradeStateDataLen: tsData?.length,
      tradeStateHex: tsData?.toString('hex') ?? null,
    };
  }));

  return res.status(200).json(out);
}
