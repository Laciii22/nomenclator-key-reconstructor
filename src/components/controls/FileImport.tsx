/**
 * FileImport: Component for importing PT and CT text from .txt files
 * 
 * Allows users to:
 * - Upload .txt files for PT or CT input
 * - Read file contents using FileReader API
 * - Clear current input and load file content
 */

import React from 'react';
import fileImportIcon from '../../assets/icons/file-import.png';
import loadingIcon from '../../assets/icons/highlighter.png';

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
  accept = '.txt,.docs',
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
            <img src={loadingIcon} alt="" aria-hidden="true" className="animate-spin h-4 w-4" />
            Loading...
          </>
        ) : (
          <>
            <img src={fileImportIcon} alt="" aria-hidden="true" className="w-4 h-4" />
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
