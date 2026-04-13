import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WalletErrorInfo {
  code?: number | string;
  message: string;
  fullMessage?: string;
  timestamp: Date;
  originalError?: unknown;
}

interface WalletErrorDetailsProps {
  error: WalletErrorInfo;
  className?: string;
}

export const WalletErrorDetails: React.FC<WalletErrorDetailsProps> = ({ error, className }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const formatTimestamp = (date: Date) => {
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  };

  const getErrorCode = (): string => {
    if (error.code !== undefined) {
      return String(error.code);
    }
    
    // Try to extract code from original error
    const origErr = error.originalError as { code?: number; info?: { error?: { code?: number } } };
    if (origErr?.code !== undefined) {
      return String(origErr.code);
    }
    if (origErr?.info?.error?.code !== undefined) {
      return String(origErr.info.error.code);
    }
    
    return 'N/A';
  };

  const getFullErrorMessage = (): string => {
    if (error.fullMessage) {
      return error.fullMessage;
    }
    
    // Try to get full message from original error
    const origErr = error.originalError as { message?: string };
    if (origErr?.message) {
      return origErr.message;
    }
    
    return error.message;
  };

  const copyErrorDetails = async () => {
    const details = `Error Details
=============
Code: ${getErrorCode()}
Message: ${error.message}
Full Message: ${getFullErrorMessage()}
Timestamp: ${formatTimestamp(error.timestamp)}
${error.originalError ? `\nOriginal Error:\n${JSON.stringify(error.originalError, null, 2)}` : ''}`;

    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy error details:', err);
    }
  };

  return (
    <div className={cn('text-sm', className)}>
      <p className="mb-2">{error.message}</p>
      
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors group-[.destructive]:text-red-200 group-[.destructive]:hover:text-white"
      >
        {isExpanded ? (
          <>
            <ChevronUp className="h-3 w-3" />
            Hide Details
          </>
        ) : (
          <>
            <ChevronDown className="h-3 w-3" />
            Show Details
          </>
        )}
      </button>

      {isExpanded && (
        <div className="mt-3 p-3 rounded-md bg-black/20 border border-white/10 space-y-2 text-xs">
          <div className="flex justify-between items-start">
            <span className="text-muted-foreground group-[.destructive]:text-red-200">Error Code:</span>
            <span className="font-mono text-right group-[.destructive]:text-red-100">{getErrorCode()}</span>
          </div>
          
          <div className="flex justify-between items-start gap-4">
            <span className="text-muted-foreground group-[.destructive]:text-red-200 shrink-0">Timestamp:</span>
            <span className="font-mono text-right group-[.destructive]:text-red-100">{formatTimestamp(error.timestamp)}</span>
          </div>
          
          <div className="pt-2 border-t border-white/10">
            <span className="text-muted-foreground group-[.destructive]:text-red-200 block mb-1">Full Message:</span>
            <p className="font-mono text-[11px] break-all whitespace-pre-wrap group-[.destructive]:text-red-100 max-h-24 overflow-y-auto">
              {getFullErrorMessage()}
            </p>
          </div>

          <button
            onClick={copyErrorDetails}
            className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 px-2 rounded text-xs font-medium bg-white/10 hover:bg-white/20 transition-colors group-[.destructive]:bg-red-900/30 group-[.destructive]:hover:bg-red-900/50"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                Copied!
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy for Bug Report
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

// Helper function to create error info object
export const createWalletErrorInfo = (
  message: string,
  originalError?: unknown,
  code?: number | string
): WalletErrorInfo => {
  return {
    code,
    message,
    timestamp: new Date(),
    originalError,
    fullMessage: originalError instanceof Error ? originalError.message : undefined,
  };
};
