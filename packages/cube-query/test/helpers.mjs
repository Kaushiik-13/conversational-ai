import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { convertLegacyModel } from "../src/model.mjs";

const sourcePath = fileURLToPath(
  new URL("../../../semantic/automotive/catalog.yaml", import.meta.url),
);

/** The automotive model document, converted from the reviewed YAML. */
export function automotiveModel() {
  return convertLegacyModel(parse(readFileSync(sourcePath, "utf8")));
}
