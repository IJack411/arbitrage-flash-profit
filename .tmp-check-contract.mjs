import { ethers } from "ethers";
import fs from "node:fs";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['\"]|['\"]$/g, "")];
    })
);

const rpc = `https://eth-mainnet.g.alchemy.com/v2/${env.VITE_ALCHEMY_API_KEY}`;
const provider = new ethers.JsonRpcProvider(rpc);
const address = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const code = await provider.getCode(address);
console.log("code_length", code.length);
console.log("is_contract", code !== "0x");
