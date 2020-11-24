#!/bin/bash
set -e
find ./dist/src/tests -name "test*.js" | npm run testone
