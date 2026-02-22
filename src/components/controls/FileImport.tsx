/**
 * FileImport: Component for importing OT and ZT text from .txt files
 * 
 * Allows users to:
 * - Upload .txt files for OT or ZT input
 * - Read file contents using FileReader API
 * - Clear current input and load file content
 */

import React from 'react';

interface FileImportProps {
  /** Label for the import button */
  label: string;
  /** Callback when file is successfully loaded */
  onFileLoad: (content: string) => void;
  /** Optional: accept only specific file types */
  accept?: string;
  /** Optional: additional CSS classes */
  className?: string;
}

/**
 * File import button with FileReader integration.
 * Reads .txt files and passes content to parent component.
 */
const FileImport: React.FC<FileImportProps> = ({
  label,
  onFileLoad,
  accept = '.txt',
  className = '',
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleFileChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        if (content) {
          onFileLoad(content);
        }
      } catch (err) {
        setError('Failed to read file');
        console.error('File read error:', err);
      } finally {
        setIsLoading(false);
        // Reset input so same file can be loaded again
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };

    reader.onerror = () => {
      setError('Failed to read file');
      setIsLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    };

    reader.readAsText(file);
  }, [onFileLoad]);

  const handleButtonClick = React.useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
        aria-label={`Import ${label} from file`}
      />
      <button
        type="button"
        onClick={handleButtonClick}
        disabled={isLoading}
        className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 border border-gray-300 rounded-md hover:bg-gray-50 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-gray-600"
        title={`Import ${label} from .txt file`}
      >
        {isLoading ? (
          <>
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading...
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            {label}
          </>
        )}
      </button>
      {error && (
        <p className="text-red-600 text-xs mt-1">{error}</p>
      )}
    </div>
  );
};

export default FileImport;
