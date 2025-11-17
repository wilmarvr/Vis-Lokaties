<?php

if (! function_exists('geo_json_clean')) {
    function geo_json_clean(?array $geometry): ?array
    {
        if (empty($geometry)) {
            return null;
        }

        return json_decode(json_encode($geometry), true);
    }
}
