/**
 * The event page's device actions (Add to calendar, the reminders chip, turning notifications on), one at a
 * time. A tap while one runs is dropped (a chip's second tap), unless it is queued: then it runs once the
 * current one finishes, in order. "Turn on notifications" is queued, as its sheet has closed and its flag is
 * set, so a dropped tap would be lost for good.
 *
 * `busy` reports while an action runs. `error(null)` clears the last failure when a tap starts an action
 * directly; a queued action leaves the failure before it on screen unless it fails too. `settled` runs after
 * each action, so the chips read the phone again.
 */
export function createDeviceActions(on: {
  busy(value: boolean): void;
  error(message: string | null): void;
  settled(): void;
}) {
  type Action = { work: () => Promise<void>; failure: string };
  let working = false;
  const waiting: Action[] = [];
  async function perform(action: Action, queued: boolean): Promise<void> {
    working = true;
    on.busy(true);
    if (!queued) on.error(null);
    try {
      await action.work();
    } catch {
      on.error(action.failure);
    } finally {
      working = false;
      on.busy(false);
      on.settled();
    }
    // Synchronously after the finally: nothing can start in between.
    const next = waiting.shift();
    if (next) await perform(next, true);
  }
  return {
    /** Resolves once this action, and anything queued behind it, has finished. Never rejects. */
    run(work: () => Promise<void>, failure: string, options: { queue?: boolean } = {}): Promise<void> {
      if (working) {
        if (options.queue) waiting.push({ work, failure });
        return Promise.resolve();
      }
      return perform({ work, failure }, false);
    },
  };
}
