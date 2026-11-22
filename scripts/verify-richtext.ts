import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { applyFormat, renderRichText } from '../src/lib/richText';

// Exercise the public editor API, including the selection it returns to the
// native textarea. No DOM or signaling is needed for formatting a string.
const bold = applyFormat('hello', 0, 5, 'bold');
assert.deepEqual(bold, { value: '**hello**', selStart: 2, selEnd: 7 }, 'Bold wraps selected plain text');
assert.deepEqual(
  applyFormat('before hello after', 7, 12, 'bold'),
  { value: 'before **hello** after', selStart: 9, selEnd: 14 },
  'Bold preserves text outside the selection',
);
assert.deepEqual(
  applyFormat(bold.value, bold.selStart, bold.selEnd, 'bold'),
  { value: 'hello', selStart: 0, selEnd: 5 },
  'pressing Bold again toggles off with the inner text still selected',
);
assert.deepEqual(
  applyFormat('**hello**', 0, 9, 'bold'),
  { value: 'hello', selStart: 0, selEnd: 5 },
  'selecting the complete marked phrase also toggles it off',
);
assert.deepEqual(
  applyFormat('a * b', 0, 5, 'bold'),
  { value: '**a * b**', selStart: 2, selEnd: 7 },
  'literal stars inside selected text are preserved',
);
assert.deepEqual(
  applyFormat('*hello*', 0, 7, 'bold'),
  { value: '***hello***', selStart: 2, selEnd: 9 },
  'a single-star phrase is not mistaken for already-bold text',
);
assert.deepEqual(
  applyFormat('hello', 5, 5, 'bold'),
  { value: 'hello****', selStart: 7, selEnd: 7 },
  'a collapsed caret lands between the new bold markers',
);
assert.deepEqual(
  applyFormat('hello****', 7, 7, 'bold'),
  { value: 'hello', selStart: 5, selEnd: 5 },
  'pressing Bold again at the collapsed caret removes the empty marker pair',
);
for (const [kind, marker] of [['italic', '*'], ['code', '`']] as const) {
  const edit = applyFormat('hello', 0, 5, kind);
  assert.equal(edit.value, `${marker}hello${marker}`, `${kind} still wraps plain text`);
  assert.deepEqual(
    applyFormat(edit.value, 0, edit.value.length, kind),
    { value: 'hello', selStart: 0, selEnd: 5 },
    `${kind} toggles off when the complete phrase is selected`,
  );
  const empty = applyFormat('', 0, 0, kind);
  assert.deepEqual(
    applyFormat(empty.value, empty.selStart, empty.selEnd, kind),
    { value: '', selStart: 0, selEnd: 0 },
    `${kind} also toggles off an empty marker pair`,
  );
}
assert.match(renderToStaticMarkup(renderRichText(bold.value)), /<strong\b[^>]*>hello<\/strong>/, 'the receiver renders the bold phrase semantically');
console.log('[verify-richtext] GREEN — bold selection, toggle, literal markers, caret and rendering');
