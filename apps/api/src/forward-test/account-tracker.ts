/**
 * Maintains the running virtual account balance.
 * Balance is reconstructed from DB on startup, then kept in-memory.
 */
export class AccountTracker {
  private balance: number;

  constructor(initialBalance: number) {
    this.balance = initialBalance;
  }

  getBalance(): number {
    return this.balance;
  }

  applyPnl(pnl: number): void {
    this.balance += pnl;
  }

  isAccountDepleted(): boolean {
    return this.balance <= 0;
  }

  reset(balance: number): void {
    this.balance = balance;
  }
}
