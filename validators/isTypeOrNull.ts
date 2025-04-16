import { Validator } from "../types";

type Types =
  | "string"
  | "number"
  | "bigint"
  | "boolean"
  | "symbol"
  | "undefined"
  | "object"
  | "function";

export function isTypeOrNull(type: Types): Validator<any> {
  return (v: any) => {
    if (v === null) return;
    if (typeof v !== type) {
      return "Not of type " + type;
    }
  };
}
