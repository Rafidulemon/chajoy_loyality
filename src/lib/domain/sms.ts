/**
 * How many SMS a message needs (BR-23). A message made only of GSM 7-bit characters (plain English) fits 160 characters,
 * or 153 per part once it is split. As soon as it has a Bangla letter, or any character outside that set, it is sent as
 * Unicode: 70 characters, or 67 per part when split. SMS needed = recipients x parts.
 * The management app uses this for its live counter and the server uses it again before sending, so they always agree.
 */

const GSM_BASIC = new Set([...'@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà']);
/** These cost two characters each: an escape plus the character. */
const GSM_EXTENDED = new Set([...'^{}\\[~]|€\f']);

export type SmsInfo = { unicode: boolean; length: number; parts: number; perPart: number; single: number };

export function smsInfo(text: string): SmsInfo {
  let gsmLength = 0;
  let isGsm = true;
  for (const ch of text) {
    if (GSM_BASIC.has(ch)) gsmLength += 1;
    else if (GSM_EXTENDED.has(ch)) gsmLength += 2;
    else {
      isGsm = false;
      break;
    }
  }
  if (isGsm) {
    return { unicode: false, length: gsmLength, parts: gsmLength === 0 ? 0 : gsmLength <= 160 ? 1 : Math.ceil(gsmLength / 153), perPart: 153, single: 160 };
  }
  const length = text.length; // UTF-16 code units, which is what the network counts
  return { unicode: true, length, parts: length <= 70 ? 1 : Math.ceil(length / 67), perPart: 67, single: 70 };
}
