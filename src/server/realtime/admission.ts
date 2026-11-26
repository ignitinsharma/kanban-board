export class StreamAdmission {
  private total = 0;
  private readonly users = new Map<string, number>();

  constructor(
    private readonly perUser = 3,
    private readonly maximum = 100,
  ) {}

  acquire(userId: string) {
    const count = this.users.get(userId) ?? 0;
    if (count >= this.perUser || this.total >= this.maximum) return null;

    this.total += 1;
    this.users.set(userId, count + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.total -= 1;
      const remaining = (this.users.get(userId) ?? 1) - 1;
      if (remaining) this.users.set(userId, remaining);
      else this.users.delete(userId);
    };
  }
}

const processAdmission = globalThis as typeof globalThis & {
  kanbanStreamAdmission?: StreamAdmission;
};

export const streamAdmission = (processAdmission.kanbanStreamAdmission ??=
  new StreamAdmission());
