@extends('emails.layouts.master')

@section('content')
    {!! str_replace(array_keys($templateVariables ?? []), array_values($templateVariables ?? []), $templateContent ?? '') !!}
@endsection
