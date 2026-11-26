declare module "bcrypt" {
  export function hash(password: string, rounds: number): Promise<string>;
  export function compare(password: string, hash: string): Promise<boolean>;
}
