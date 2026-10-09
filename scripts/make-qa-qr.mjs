import QRCode from 'qrcode';
import {mkdir} from 'node:fs/promises';
await mkdir('artifacts',{recursive:true});
// Public RFC test secret. Never associate this fixture with a real account.
await QRCode.toFile('artifacts/rfc-test-qr.png','otpauth://totp/RFC%20Fixture%3Apublic-test-only?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=RFC%20Fixture',{width:360,margin:4});
