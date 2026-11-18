<?php

namespace App\Support;

use DOMDocument;
use DOMElement;
use DOMXPath;

class EmailHtmlSanitizer
{
    private const REMOVED_TAGS = [
        'script', 'style', 'svg', 'math', 'template', 'iframe', 'frameset', 'frame', 'applet', 'object', 'embed',
        'form', 'input', 'button', 'meta', 'link', 'base', 'noscript',
    ];

    private const URL_ATTRIBUTES = ['href', 'src', 'srcset', 'background', 'poster', 'action', 'formaction', 'xlink:href'];

    public static function clean(string $html): string
    {
        $document = new DOMDocument;
        libxml_use_internal_errors(true);
        $document->loadHTML('<?xml encoding="utf-8"?><html><body>'.$html.'</body></html>', LIBXML_HTML_NODEFDTD);
        libxml_clear_errors();

        $xpath = new DOMXPath($document);

        foreach (self::REMOVED_TAGS as $tag) {
            foreach (iterator_to_array($xpath->query("//{$tag}")) as $node) {
                $node->parentNode->removeChild($node);
            }
        }

        foreach ($xpath->query('//*') as $element) {
            if ($element instanceof DOMElement) {
                self::cleanAttributes($element);
            }
        }

        $body = $document->getElementsByTagName('body')->item(0);
        $output = '';
        foreach ($body->childNodes as $child) {
            $output .= $document->saveHTML($child);
        }

        return $output;
    }

    private static function cleanAttributes(DOMElement $element): void
    {
        foreach (iterator_to_array($element->attributes) as $attribute) {
            $name = strtolower($attribute->name);
            $value = preg_replace('/[\s\x00-\x1f]+/', '', strtolower($attribute->value));

            $isHandler = str_starts_with($name, 'on');
            $isUnsafeUrl = in_array($name, self::URL_ATTRIBUTES, true) && preg_match('/^(javascript|vbscript|data):/', $value);

            $isUnsafeStyle = $name === 'style' && preg_match('/javascript:|expression\(/', $value);

            if ($isHandler || $isUnsafeUrl || $isUnsafeStyle) {
                $element->removeAttribute($attribute->name);
            }
        }
    }
}
