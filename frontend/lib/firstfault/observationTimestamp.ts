const OBSERVATION_SAFETY_MARGIN_SECONDS = 60;

export function observationTimestamp(nowMilliseconds = Date.now()): bigint {
  const nowSeconds = Math.floor(nowMilliseconds / 1_000);
  return BigInt(Math.max(0, nowSeconds - OBSERVATION_SAFETY_MARGIN_SECONDS));
}
