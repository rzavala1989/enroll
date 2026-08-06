import type { MetricsService } from './metrics.service';
import type { SchedulerGate } from './scheduler-gate.service';

/**
 * No-op metrics and an always-on scheduler gate, for unit tests.
 *
 * Counters are cross-cutting instrumentation, not behavior, so specs
 * should not have to know which ones a service touches. A Proxy that
 * answers every property with an incrementable stub keeps the specs
 * from breaking every time a new counter is added.
 */
export function stubMetrics(): MetricsService {
  const counter = {
    inc: () => undefined,
    set: () => undefined,
    startTimer: () => () => undefined,
  };
  return new Proxy({} as MetricsService, {
    get: (_target, prop) => (prop === 'registry' ? {} : counter),
  });
}

export function stubSchedulerGate(enabled = true): SchedulerGate {
  return { enabled } as SchedulerGate;
}
