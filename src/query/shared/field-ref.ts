import type { FieldBase, TransformContext } from "../../fields"
import type { QueryProperty } from "../path"

export class FieldRef<T = any, K extends string = string, F extends FieldBase<T> = FieldBase<T>> {
  readonly field: F
  readonly path: readonly QueryProperty[]
  private readonly _path: string

  constructor(
    field: F,
    path?: string,
    pathSegments?: readonly QueryProperty[],
  ) {
    // Keep runtime support for old string-constructed refs while the typed API
    // requires a real field instance.
    if (typeof (field as unknown) === "string") {
      const name = field as unknown as string
      this.field = {
        name,
        fromDataverseName: name,
        toDataverseName: name,
        transformValueFromDataverse: (value: unknown) => value,
        transformValueToDataverse: (value: unknown) => value,
      } as F
      this._path = path ?? name
      this.path = pathSegments ?? [this.field]
    } else {
      this.field = field
      this._path = path ?? field.fromDataverseName
      this.path = pathSegments ?? [field]
    }
  }

  static fromPath<T, F extends FieldBase<T>>(field: F, path: string, pathSegments?: readonly QueryProperty[]): FieldRef<T, string, F> {
    return new FieldRef(field, path, pathSegments)
  }

  get dataverseName(): string {
    return this._path
  }

  transformFromDataverse(value: unknown, ctx?: TransformContext): T {
    return this.field.transformValueFromDataverse(value, ctx)
  }

  transformToDataverse(value: T, ctx?: TransformContext): unknown {
    return this.field.transformValueToDataverse(value, ctx)
  }

  toString(): string {
    return this._path
  }
}
