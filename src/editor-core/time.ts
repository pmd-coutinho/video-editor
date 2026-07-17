import { EditorError } from './errors'

export interface ExactTime {
  readonly numerator: number
  readonly denominator: number
}

export const ZERO_TIME = createTime(0, 1)
export const FRAME_DURATION = createTime(1, 30)
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER)

export function createTime(numerator: number, denominator: number): ExactTime {
  assertSafeInteger(numerator)
  assertSafeInteger(denominator)

  if (denominator === 0) {
    throw new EditorError('INVALID_TIME', { reason: 'zero-denominator' })
  }

  if (numerator === 0) {
    return Object.freeze({ numerator: 0, denominator: 1 })
  }

  const sign = denominator < 0 ? -1 : 1
  const divisor = greatestCommonDivisor(
    Math.abs(numerator),
    Math.abs(denominator),
  )
  const normalizedNumerator = (numerator / divisor) * sign
  const normalizedDenominator = (denominator / divisor) * sign

  assertSafeInteger(normalizedNumerator)
  assertSafeInteger(normalizedDenominator)
  return Object.freeze({
    numerator: normalizedNumerator,
    denominator: normalizedDenominator,
  })
}

export function compareTime(left: ExactTime, right: ExactTime): number {
  return compareIntegers(
    BigInt(left.numerator) * BigInt(right.denominator),
    BigInt(right.numerator) * BigInt(left.denominator),
  )
}

export function addTime(left: ExactTime, right: ExactTime): ExactTime {
  return createTimeFromBigInts(
    BigInt(left.numerator) * BigInt(right.denominator) +
      BigInt(right.numerator) * BigInt(left.denominator),
    BigInt(left.denominator) * BigInt(right.denominator),
  )
}

export function subtractTime(left: ExactTime, right: ExactTime): ExactTime {
  return addTime(left, createTime(-right.numerator, right.denominator))
}

export function timeToSeconds(time: ExactTime): number {
  return time.numerator / time.denominator
}

export function timeFromMicroseconds(microseconds: number): ExactTime {
  return createTime(microseconds, 1_000_000)
}

export function timeToMicroseconds(time: ExactTime): number {
  const numerator = BigInt(time.numerator) * 1_000_000n
  const denominator = BigInt(time.denominator)
  if (numerator % denominator !== 0n) {
    throw new EditorError('INVALID_TIME', {
      reason: 'not-an-integral-microsecond',
      time,
    })
  }
  return toSafeInteger(numerator / denominator)
}

export function parseTimecode(timecode: string): ExactTime {
  const match = /^(\d+):(\d{2}):(\d{2}):(\d{2})$/.exec(timecode)

  if (match === null) {
    throw new EditorError('INVALID_TIMECODE', { timecode })
  }

  const [, hours, minutes, seconds, frames] = match
  const hour = Number(hours)
  const minute = Number(minutes)
  const second = Number(seconds)
  const frame = Number(frames)

  if (minute > 59 || second > 59 || frame > 29) {
    throw new EditorError('INVALID_TIMECODE', { timecode })
  }

  return createTime(((hour * 60 + minute) * 60 + second) * 30 + frame, 30)
}

export function formatTimecode(time: ExactTime): string {
  const frameCount = BigInt(time.numerator) * 30n
  const denominator = BigInt(time.denominator)

  if (frameCount < 0n || frameCount % denominator !== 0n) {
    throw new EditorError('INVALID_TIMECODE', { time })
  }

  const totalFrames = toSafeInteger(frameCount / denominator)
  const frames = totalFrames % 30
  const totalSeconds = (totalFrames - frames) / 30
  const seconds = totalSeconds % 60
  const totalMinutes = (totalSeconds - seconds) / 60
  const minutes = totalMinutes % 60
  const hours = (totalMinutes - minutes) / 60

  return [hours, minutes, seconds, frames]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

export function isNormalizedTime(value: unknown): value is ExactTime {
  return (
    typeof value === 'object' &&
    value !== null &&
    'numerator' in value &&
    'denominator' in value &&
    typeof value.numerator === 'number' &&
    typeof value.denominator === 'number' &&
    Number.isSafeInteger(value.numerator) &&
    Number.isSafeInteger(value.denominator) &&
    value.denominator > 0 &&
    greatestCommonDivisor(Math.abs(value.numerator), value.denominator) === 1
  )
}

function greatestCommonDivisor(left: number, right: number): number {
  let dividend = left
  let divisor = right

  while (divisor !== 0) {
    const remainder = dividend % divisor
    dividend = divisor
    divisor = remainder
  }

  return dividend
}

function assertSafeInteger(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new EditorError('INVALID_TIME', { value })
  }
}

function createTimeFromBigInts(
  numerator: bigint,
  denominator: bigint,
): ExactTime {
  if (denominator === 0n) {
    throw new EditorError('INVALID_TIME', { reason: 'zero-denominator' })
  }
  if (numerator === 0n) {
    return ZERO_TIME
  }

  const sign = denominator < 0n ? -1n : 1n
  const divisor = greatestCommonDivisorBigInt(
    numerator < 0n ? -numerator : numerator,
    denominator < 0n ? -denominator : denominator,
  )
  return createTime(
    toSafeInteger((numerator / divisor) * sign),
    toSafeInteger((denominator / divisor) * sign),
  )
}

function toSafeInteger(value: bigint): number {
  if (value < -MAX_SAFE_INTEGER || value > MAX_SAFE_INTEGER) {
    throw new EditorError('TIME_OVERFLOW', { value: value.toString() })
  }
  return Number(value)
}

function compareIntegers(left: bigint, right: bigint): number {
  if (left < right) {
    return -1
  }

  if (left > right) {
    return 1
  }

  return 0
}

function greatestCommonDivisorBigInt(left: bigint, right: bigint): bigint {
  let dividend = left
  let divisor = right

  while (divisor !== 0n) {
    const remainder = dividend % divisor
    dividend = divisor
    divisor = remainder
  }

  return dividend
}
