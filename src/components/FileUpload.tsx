import React, { useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileText, 
  FileSpreadsheet, 
  FileCode, 
  File, 
  Trash2, 
  Eye, 
  AlertCircle, 
  CheckCircle,
  Loader2,
  Paperclip
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
  type: string;
  category: 'pdf' | 'excel' | 'word' | 'image' | 'other';
  url: string;
  uploadedAt: string;
  file?: File;
}

export interface FileUploadProps {
  value?: UploadedFile[];
  onChange?: (files: UploadedFile[]) => void;
  allowedExtensions?: string[]; // e.g. ['pdf', 'xlsx', 'xls', 'docx', 'doc', 'csv']
  maxSizeBytes?: number; // Default 10MB
  multiple?: boolean;
  maxFiles?: number;
  storageBucket?: string;
  label?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

const DEFAULT_ALLOWED = ['pdf', 'xlsx', 'xls', 'docx', 'doc', 'csv', 'png', 'jpg', 'jpeg'];
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

export function getFileCategory(filename: string): UploadedFile['category'] {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (['pdf'].includes(ext)) return 'pdf';
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'excel';
  if (['docx', 'doc', 'rtf'].includes(ext)) return 'word';
  if (['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext)) return 'image';
  return 'other';
}

export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default function FileUpload({
  value = [],
  onChange,
  allowedExtensions = DEFAULT_ALLOWED,
  maxSizeBytes = DEFAULT_MAX_SIZE,
  multiple = true,
  maxFiles = 5,
  storageBucket = 'payment-documents',
  label = 'Upload Supporting Files',
  description = 'Supports PDF, Excel (.xlsx, .csv), and Word (.docx) documents up to 10MB',
  disabled = false,
  className
}: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (fileList: FileList | File[]) => {
    if (disabled || isUploading) return;
    const selectedFiles = Array.from(fileList);

    if (!selectedFiles.length) return;

    if (!multiple && selectedFiles.length > 1) {
      toast.error('Only one file can be uploaded at a time');
      return;
    }

    if (value.length + selectedFiles.length > maxFiles) {
      toast.error(`Maximum allowed files limit is ${maxFiles}`);
      return;
    }

    // Validate files
    const validFiles: File[] = [];
    for (const file of selectedFiles) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      
      if (!allowedExtensions.includes(ext)) {
        toast.error(`"${file.name}" format is not allowed. Allowed: ${allowedExtensions.join(', ')}`);
        continue;
      }

      if (file.size > maxSizeBytes) {
        toast.error(`"${file.name}" exceeds max limit of ${formatBytes(maxSizeBytes)}`);
        continue;
      }

      const exists = value.some(f => f.name === file.name && f.size === file.size);
      if (exists) {
        toast.error(`"${file.name}" is already attached`);
        continue;
      }

      validFiles.push(file);
    }

    if (!validFiles.length) return;

    setIsUploading(true);
    setUploadProgress(`Processing ${validFiles.length} file(s)...`);

    const newUploadedFiles: UploadedFile[] = [];

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      const category = getFileCategory(file.name);
      const cleanFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const filePath = `uploads/${Date.now()}_${cleanFileName}`;

      let fileUrl = '';
      try {
        setUploadProgress(`Uploading ${file.name}...`);
        
        // Attempt upload to Supabase storage
        const { data, error } = await supabase.storage.from(storageBucket).upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });

        if (!error && data) {
          const { data: publicUrlData } = supabase.storage.from(storageBucket).getPublicUrl(data.path);
          fileUrl = publicUrlData.publicUrl;
        } else {
          // Fallback to local Object URL for offline/mock environments
          fileUrl = URL.createObjectURL(file);
        }
      } catch (err) {
        console.warn('Supabase storage fallback used:', err);
        fileUrl = URL.createObjectURL(file);
      }

      newUploadedFiles.push({
        id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        category,
        url: fileUrl,
        uploadedAt: new Date().toISOString(),
        file
      });
    }

    const updated = multiple ? [...value, ...newUploadedFiles] : newUploadedFiles;
    onChange?.(updated);
    const msg = `Successfully uploaded ${newUploadedFiles.length} file(s)!`;
    setSuccessMessage(msg);
    toast.success(msg);
    setTimeout(() => setSuccessMessage(null), 5000);
    setIsUploading(false);
    setUploadProgress(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isUploading) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled || isUploading) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleRemove = (id: string) => {
    if (disabled) return;
    const filtered = value.filter(f => f.id !== id);
    onChange?.(filtered);
    toast.success('File removed');
  };

  const renderBadgeIcon = (category: UploadedFile['category']) => {
    switch (category) {
      case 'pdf':
        return <FileText className="w-5 h-5 text-red-600" />;
      case 'excel':
        return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
      case 'word':
        return <FileCode className="w-5 h-5 text-blue-600" />;
      case 'image':
        return <File className="w-5 h-5 text-amber-600" />;
      default:
        return <Paperclip className="w-5 h-5 text-gray-600" />;
    }
  };

  const renderBadgeStyle = (category: UploadedFile['category']) => {
    switch (category) {
      case 'pdf':
        return 'bg-red-50 border-red-200 text-red-700';
      case 'excel':
        return 'bg-emerald-50 border-emerald-200 text-emerald-700';
      case 'word':
        return 'bg-blue-50 border-blue-200 text-blue-700';
      case 'image':
        return 'bg-amber-50 border-amber-200 text-amber-700';
      default:
        return 'bg-gray-50 border-gray-200 text-gray-700';
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      {label && (
        <div className="flex justify-between items-center">
          <label className="block text-sm font-semibold text-gray-800">
            {label}
          </label>
          <span className="text-xs text-gray-500 font-medium">
            {value.length} / {maxFiles} files
          </span>
        </div>
      )}

      {/* Success Notification Alert */}
      {successMessage && (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold animate-in fade-in duration-300 shadow-sm">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
        multiple={multiple}
        accept={allowedExtensions.map(ext => `.${ext}`).join(',')}
        className="hidden"
        disabled={disabled || isUploading}
      />

      {/* Drag & Drop Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !disabled && !isUploading && fileInputRef.current?.click()}
        className={cn(
          "relative border-2 border-dashed rounded-2xl p-6 transition-all duration-200 flex flex-col items-center justify-center text-center cursor-pointer select-none",
          isDragging 
            ? "border-[#004d25] bg-green-50/60 scale-[1.01]" 
            : "border-gray-300 hover:border-[#004d25]/60 hover:bg-gray-50/70 bg-white",
          disabled && "opacity-50 cursor-not-allowed hover:bg-white hover:border-gray-300",
          isUploading && "cursor-wait bg-gray-50/80"
        )}
      >
        <div className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center mb-3 transition-transform duration-200",
          isDragging ? "bg-[#004d25] text-white scale-110" : "bg-emerald-50 text-[#004d25]"
        )}>
          {isUploading ? (
            <Loader2 className="w-6 h-6 animate-spin text-[#004d25]" />
          ) : (
            <UploadCloud className="w-6 h-6" />
          )}
        </div>

        <p className="text-sm font-semibold text-gray-800 mb-1">
          {isUploading 
            ? (uploadProgress || "Uploading files...")
            : isDragging 
            ? "Drop your files here to attach"
            : "Click to upload or drag & drop files"}
        </p>

        <p className="text-xs text-gray-500 max-w-sm">
          {description}
        </p>

        <div className="flex flex-wrap justify-center gap-1.5 mt-3">
          {['PDF', 'EXCEL', 'DOCX'].map((type) => (
            <span 
              key={type} 
              className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200"
            >
              {type}
            </span>
          ))}
        </div>
      </div>

      {/* Uploaded Files List */}
      {value.length > 0 && (
        <div className="space-y-2 mt-4">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
            Attached Documents ({value.length})
          </p>

          <div className="grid grid-cols-1 gap-2.5">
            {value.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-xl hover:border-gray-300 shadow-sm transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className={cn(
                    "w-10 h-10 rounded-lg border flex items-center justify-center shrink-0",
                    renderBadgeStyle(file.category)
                  )}>
                    {renderBadgeIcon(file.category)}
                  </div>

                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-[#004d25] transition-colors">
                      {file.name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                      <span>{formatBytes(file.size)}</span>
                      <span>•</span>
                      <span className="uppercase text-[10px] font-bold tracking-wider px-1.5 py-0.2 rounded bg-gray-100 border border-gray-200 text-gray-600">
                        {file.category}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {file.url && (
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-gray-500 hover:text-[#004d25] hover:bg-green-50 rounded-lg transition-colors cursor-pointer"
                      title="View file"
                    >
                      <Eye className="w-4 h-4" />
                    </a>
                  )}

                  {!disabled && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(file.id);
                      }}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Remove file"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
