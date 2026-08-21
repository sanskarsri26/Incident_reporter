import type { FaultInjector } from "@/simulator/types";
import { injectDbConnectionPoolExhaustion, FAULT_SLUG as DB_CONNECTION_POOL_EXHAUSTION } from "@/simulator/fault-injection/db-connection-pool-exhaustion";
import { injectDbSlowQuery, FAULT_SLUG as DB_SLOW_QUERY } from "@/simulator/fault-injection/db-slow-query";
import { injectMemoryLeak, FAULT_SLUG as MEMORY_LEAK } from "@/simulator/fault-injection/memory-leak";
import { injectDependencyTimeout, FAULT_SLUG as DEPENDENCY_TIMEOUT } from "@/simulator/fault-injection/dependency-timeout";
import { injectCpuSpike, FAULT_SLUG as CPU_SPIKE } from "@/simulator/fault-injection/cpu-spike";
import { injectRedisUnavailable, FAULT_SLUG as REDIS_UNAVAILABLE } from "@/simulator/fault-injection/redis-unavailable";
import { injectWorkerBacklog, FAULT_SLUG as WORKER_BACKLOG } from "@/simulator/fault-injection/worker-backlog";
import { injectBadConfigDeploy, FAULT_SLUG as BAD_CONFIG_DEPLOY } from "@/simulator/fault-injection/bad-config-deploy";

export const FAULT_REGISTRY: Record<string, FaultInjector> = {
  [DB_CONNECTION_POOL_EXHAUSTION]: injectDbConnectionPoolExhaustion,
  [DB_SLOW_QUERY]: injectDbSlowQuery,
  [MEMORY_LEAK]: injectMemoryLeak,
  [DEPENDENCY_TIMEOUT]: injectDependencyTimeout,
  [CPU_SPIKE]: injectCpuSpike,
  [REDIS_UNAVAILABLE]: injectRedisUnavailable,
  [WORKER_BACKLOG]: injectWorkerBacklog,
  [BAD_CONFIG_DEPLOY]: injectBadConfigDeploy,
};

export const FAULT_SLUGS = Object.keys(FAULT_REGISTRY);

export {
  injectDbConnectionPoolExhaustion,
  injectDbSlowQuery,
  injectMemoryLeak,
  injectDependencyTimeout,
  injectCpuSpike,
  injectRedisUnavailable,
  injectWorkerBacklog,
  injectBadConfigDeploy,
};
