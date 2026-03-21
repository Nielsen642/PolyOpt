import { Wallet } from "ethers";
import { ClobClient } from "@polymarket/clob-client";

async function main() {
  const pk = process.env.POLYMARKET_PRIVATE_KEY;
  if (!pk) throw new Error("Set POLYMARKET_PRIVATE_KEY in env to run this script.");
  const signer = new Wallet(pk);
  const client = new ClobClient("https://clob.polymarket.com", 137, signer);
  const creds = await client.createOrDeriveApiKey();
  console.log(JSON.stringify(creds, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});