import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  expectedPolicyPublicationDigests,
  loadPolicyPublicationManifest,
  POLICY_PUBLICATION_MANIFEST_PATH,
  validatePolicyPublicationManifest,
} from "./policy-publication-manifest-policy.mjs";

try {
  if (process.argv.includes("--print-digests")) {
    const manifest = JSON.parse(readFileSync(resolve(POLICY_PUBLICATION_MANIFEST_PATH), "utf8"));
    console.log(JSON.stringify(expectedPolicyPublicationDigests(manifest), null, 2));
  } else {
    const requireFinalized = process.argv.includes("--require-finalized");
    const manifest = loadPolicyPublicationManifest(process.cwd(), { requireFinalized });
    const contract = validatePolicyPublicationManifest(manifest, { requireFinalized });
    console.log(`[policy-manifest] PASS ${contract.bundleDigest} finalized=${contract.finalized}`);
  }
} catch (error) {
  console.error(`[policy-manifest] FAIL ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
