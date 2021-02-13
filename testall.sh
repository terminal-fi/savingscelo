#!/bin/bash
set -e
find ./dist/src/tests -name "test*.js" | xargs yarn testone
