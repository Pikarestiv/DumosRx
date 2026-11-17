<?php

namespace App\Services\Backup;

use RuntimeException;

/**
 * File layout: MAGIC | sealed data key | secretstream header | frames, where every frame
 * is a 4-byte big-endian length followed by that many ciphertext bytes. Only the holder of
 * the secret key that matches the configured public key can open the sealed data key.
 */
class BackupEncryptor
{
    private const MAGIC = "DRXBK1\n";

    private const PLAINTEXT_CHUNK = 65536;

    public function encryptFile(string $source, string $destination, string $publicKey): void
    {
        $dataKey = sodium_crypto_secretstream_xchacha20poly1305_keygen();
        [$state, $header] = sodium_crypto_secretstream_xchacha20poly1305_init_push($dataKey);

        $in = fopen($source, 'rb');
        $out = fopen($destination, 'wb');
        if ($in === false || $out === false) {
            throw new RuntimeException('Cannot open the backup files for encryption.');
        }

        fwrite($out, self::MAGIC.sodium_crypto_box_seal($dataKey, $publicKey).$header);
        while (! feof($in)) {
            $chunk = (string) fread($in, self::PLAINTEXT_CHUNK);
            $tag = feof($in) ? SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_FINAL : SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_MESSAGE;
            $frame = sodium_crypto_secretstream_xchacha20poly1305_push($state, $chunk, '', $tag);
            fwrite($out, pack('N', strlen($frame)).$frame);
        }
        fclose($in);
        fclose($out);
    }

    public function decryptFile(string $source, string $destination, string $keypair): void
    {
        $in = fopen($source, 'rb');
        $out = fopen($destination, 'wb');
        if ($in === false || $out === false) {
            throw new RuntimeException('Cannot open the backup files for decryption.');
        }
        if (fread($in, strlen(self::MAGIC)) !== self::MAGIC) {
            throw new RuntimeException('This is not a DumosRx database backup.');
        }

        $dataKey = sodium_crypto_box_seal_open((string) fread($in, SODIUM_CRYPTO_BOX_SEALBYTES + SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_KEYBYTES), $keypair);
        if ($dataKey === false) {
            throw new RuntimeException('The secret key does not open this backup.');
        }
        $state = sodium_crypto_secretstream_xchacha20poly1305_init_pull((string) fread($in, SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_HEADERBYTES), $dataKey);

        $finished = false;
        while (! $finished && ! feof($in)) {
            $prefix = (string) fread($in, 4);
            if (strlen($prefix) < 4) {
                break;
            }
            $result = sodium_crypto_secretstream_xchacha20poly1305_pull($state, (string) fread($in, unpack('N', $prefix)[1]));
            if ($result === false) {
                throw new RuntimeException('The backup is corrupt or has been tampered with.');
            }
            fwrite($out, $result[0]);
            $finished = $result[1] === SODIUM_CRYPTO_SECRETSTREAM_XCHACHA20POLY1305_TAG_FINAL;
        }
        fclose($in);
        fclose($out);
        if (! $finished) {
            throw new RuntimeException('The backup is truncated.');
        }
    }
}
