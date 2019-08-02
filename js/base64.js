
const URL_SAFE_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const CHARACTER_LOOKUP = createCharacterLookup();

function createCharacterLookup() {
	var lookup = new Array(256);
	for (var i = 0; i < 64; i++) {
		lookup[URL_SAFE_CHARACTERS[i]] = i;
	}
	return lookup;
}

export function encodeUrlSafe(bytes) {
	var text = new Array();

	var val = 0;
	var valb = -6;

	for (var i = 0; i < bytes.length; i++) {
		var b = bytes[i];
		val = (val << 8) + b;
		valb += 8;

		while (valb >= 0) {
			text.push(URL_SAFE_CHARACTERS[(val >> valb) & 0x3F]);
			valb -= 6;
		}
	}

	if (valb > -6) {
		text.push(URL_SAFE_CHARACTERS[((val << 8) >> (valb + 8)) & 0x3F]);
	}

	return text.join("");
}

export function decodeUrlSafe(text) {
	var data = new Array();

	var val = 0;
	var valb = -8;
	for (var i = 0; i < text.length; i++) {
		var c = text[i];
		var charIndex = CHARACTER_LOOKUP[c];
		if (charIndex === undefined) {
			throw new Error("Unexpected character: " + c);
		}

		val = (val << 6) + charIndex;
		valb += 6;

		if (valb >= 0) {
			data.push((val >> valb) & 0xFF);
			valb -= 8;
		}
	}

	return new Uint8Array(data);
}
