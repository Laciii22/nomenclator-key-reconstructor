import React from 'react';

export type FileInfoProps = {
  name: string;
  length: number;
  label?: string;
};

const FileInfo: React.FC<FileInfoProps> = ({ name, length, label }) => {
  return (
    <div className="text-sm text-gray-700">
      <div className="font-medium">{label ?? 'Súbor'}</div>
      <div className="text-gray-600">{name || '—'}</div>
      <div className="text-gray-500">{length} znakov</div>
    </div>
  );
};

export default FileInfo;
