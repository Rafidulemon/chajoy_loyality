import 'server-only';

type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

/** One JSON object per line, so Vercel / CloudWatch can filter it. Never pass secrets, OTP codes, PINs or full phone numbers. */
function emit(level: Level, msg: string, fields?: Fields) {
  if (process.env.NODE_ENV === 'test' && level !== 'error') return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Fields) => emit('debug', msg, fields),
  info: (msg: string, fields?: Fields) => emit('info', msg, fields),
  warn: (msg: string, fields?: Fields) => emit('warn', msg, fields),
  error: (msg: string, fields?: Fields) => emit('error', msg, fields),
};

/** "+8801712345678" -> "+880***678", the most that belongs in a log. */
export function maskPhone(phone: string) {
  return phone.length > 7 ? `${phone.slice(0, 4)}***${phone.slice(-3)}` : '***';
}

/** An Error as log fields: name, message and stack, nothing else. */
export function errorFields(e: unknown): Fields {
  if (e instanceof Error) return { errName: e.name, errMessage: e.message, stack: e.stack?.split('\n').slice(0, 8).join('\n') };
  return { errMessage: String(e) };
}
