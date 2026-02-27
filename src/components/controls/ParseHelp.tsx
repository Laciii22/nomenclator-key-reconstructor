import React from 'react';

const ParseHelp: React.FC = () => {
  return (
    <div className="ml-2 text-sm">
      <details className="text-xs">
        <summary className="cursor-pointer underline">What are the parse modes?</summary>
        <div className="mt-1 p-2 bg-gray-50 border border-gray-200 rounded text-xs">
          <strong>Separator mode</strong>: CT input is split by a chosen separator character (e.g. ':'). Use this when tokens are already separated.
          <br />
          <strong>Fixed-length mode</strong>: CT input is treated as a raw character stream that is grouped into fixed-size groups (e.g. groups of 2 characters). Useful when tokens are fixed-width.
          <br />
          <br />
          <strong>Deception tokens</strong>: If CT contains extra tokens (more than PT characters), mark some tokens as deception to exclude them from analysis. Use the "Deception token" controls below to bracket tokens.
        </div>
      </details>
    </div>
  );
};

export default ParseHelp;
