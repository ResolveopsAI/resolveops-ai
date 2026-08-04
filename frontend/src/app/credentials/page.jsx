"use client";

import React, { useState, useCallback } from "react";
import { fetchApi } from "@/lib/api";
import DashboardLayout from "@/components/layout/DashboardLayout";
import {
  KeyRound,
  Upload,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Server,
  Shield,
  RefreshCw,
  Fingerprint,
  Wifi,
  WifiOff,
  FileKey,
  Eye,
  EyeOff,
  X,
} from "lucide-react";

export default function CredentialsPage() {
  const [credentials, setCredentials] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [matchResults, setMatchResults] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [notification, setNotification] = useState(null);

  // Upload form state
  const [keyName, setKeyName] = useState("");
  const [awsAccountId, setAwsAccountId] = useState("");
  const [pemContent, setPemContent] = useState("");
  const [pemFileName, setPemFileName] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);

  const showNotification = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleFileSelect = useCallback((file) => {
    if (!file) return;
    if (!file.name.endsWith(".pem") && !file.name.endsWith(".key")) {
      showNotification("error", "Please upload a .pem or .key file");
      return;
    }
    setPemFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      // Convert to base64
      const base64 = btoa(content);
      setPemContent(base64);
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      handleFileSelect(file);
    },
    [handleFileSelect]
  );

  const handleUpload = async () => {
    if (!keyName || !awsAccountId || !pemContent) {
      showNotification("error", "Please fill in all fields and select a PEM file");
      return;
    }

    setIsUploading(true);
    try {
      const res = await fetchApi("/api/v1/credentials/pem", {
        method: "POST",
        body: JSON.stringify({
          key_name: keyName,
          aws_account_id: awsAccountId,
          pem_content: pemContent,
        }),
      });

      if (res) {
        setCredentials((prev) => [
          ...prev,
          {
            id: res.credential_id,
            key_name: res.key_name,
            aws_account_id: res.aws_account_id,
            fingerprint: res.fingerprint,
            aws_key_pair_name: res.aws_key_pair_name,
            status: "active",
            matched_instance_count: res.matched_instances?.length || 0,
          },
        ]);

        setMatchResults({
          matched: res.matched_instances || [],
          unmatched: res.unmatched_instances || [],
        });

        showNotification("success", res.message);
        setShowUploadModal(false);
        resetForm();
      }
    } catch (err) {
      showNotification("error", err.message || "Failed to upload PEM");
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setKeyName("");
    setAwsAccountId("");
    setPemContent("");
    setPemFileName("");
  };

  const handleDelete = async (keyId) => {
    try {
      await fetchApi(`/api/v1/credentials/pem/${keyId}`, { method: "DELETE" });
      setCredentials((prev) => prev.filter((c) => c.id !== keyId));
      showNotification("success", "Credential deleted successfully");
    } catch (err) {
      showNotification("error", err.message);
    }
  };

  const handleTestConnection = async (keyId, instanceId) => {
    setTestingId(keyId);
    try {
      const res = await fetchApi(`/api/v1/credentials/pem/${keyId}/test-connection`, {
        method: "POST",
        body: JSON.stringify({ instance_id: instanceId }),
      });
      showNotification(
        res.status === "success" ? "success" : "error",
        res.message
      );
    } catch (err) {
      showNotification("error", err.message);
    } finally {
      setTestingId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Notification Toast */}
        {notification && (
          <div
            className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right duration-300 ${
              notification.type === "success"
                ? "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"
                : "bg-rose-500/15 border border-rose-500/30 text-rose-400"
            }`}
          >
            {notification.type === "success" ? (
              <CheckCircle2 size={18} />
            ) : (
              <AlertTriangle size={18} />
            )}
            <span className="text-sm font-medium">{notification.message}</span>
            <button onClick={() => setNotification(null)}>
              <X size={14} />
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <KeyRound size={22} className="text-amber-400" />
              </div>
              SSH Credentials
            </h1>
            <p className="text-slate-400 mt-2 text-sm">
              Manage PEM keys for SSH access to EC2 instances. Keys are encrypted with AES-256-GCM.
            </p>
          </div>
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 border border-indigo-500/30 rounded-xl transition-all font-semibold text-sm"
          >
            <Upload size={16} />
            Upload PEM Key
          </button>
        </div>

        {/* Security Notice */}
        <div className="glass-panel rounded-xl p-4 flex items-start gap-3 border-l-4 border-l-amber-500/50">
          <Shield size={18} className="text-amber-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-300">
              End-to-End Encryption
            </p>
            <p className="text-xs text-slate-400 mt-1">
              PEM files are encrypted with AES-256-GCM before storage. Your private keys
              are never stored in plaintext and are never logged. Only the fingerprint is
              retained for key-pair matching.
            </p>
          </div>
        </div>

        {/* Credentials Table */}
        <div className="glass-panel rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800/50">
            <h2 className="font-semibold text-slate-200 text-sm">Stored Credentials</h2>
          </div>

          {credentials.length === 0 ? (
            <div className="p-12 text-center">
              <FileKey size={40} className="text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No PEM keys uploaded yet</p>
              <p className="text-slate-500 text-xs mt-1">
                Upload a PEM key to enable SSH-based self-healing for your EC2 instances
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800/30">
                    <th className="text-left px-5 py-3">Name</th>
                    <th className="text-left px-5 py-3">AWS Account</th>
                    <th className="text-left px-5 py-3">Key Pair</th>
                    <th className="text-left px-5 py-3">Fingerprint</th>
                    <th className="text-center px-5 py-3">Matched Instances</th>
                    <th className="text-center px-5 py-3">Status</th>
                    <th className="text-right px-5 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {credentials.map((cred) => (
                    <tr
                      key={cred.id}
                      className="border-b border-slate-800/20 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <KeyRound size={14} className="text-amber-400" />
                          <span className="text-sm font-medium text-slate-200">
                            {cred.key_name}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-400 font-mono">
                        {cred.aws_account_id}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-400">
                        {cred.aws_key_pair_name || (
                          <span className="text-slate-600 italic">Not matched</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <code className="text-xs text-slate-500 bg-slate-800/50 px-2 py-1 rounded font-mono">
                          {cred.fingerprint?.substring(0, 16)}...
                        </code>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                            cred.matched_instance_count > 0
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-slate-700/30 text-slate-500 border border-slate-700/30"
                          }`}
                        >
                          <Server size={12} />
                          {cred.matched_instance_count}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                            cred.status === "active"
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          }`}
                        >
                          {cred.status === "active" ? (
                            <Wifi size={12} />
                          ) : (
                            <WifiOff size={12} />
                          )}
                          {cred.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => handleDelete(cred.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                          title="Delete credential"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Instance Match Results */}
        {matchResults && (
          <div className="space-y-4">
            {/* Matched Instances */}
            {matchResults.matched.length > 0 && (
              <div className="glass-panel rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800/50 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  <h3 className="font-semibold text-emerald-400 text-sm">
                    Matched Instances — Self-Healing Ready ({matchResults.matched.length})
                  </h3>
                </div>
                <div className="p-4 space-y-2">
                  {matchResults.matched.map((inst) => (
                    <div
                      key={inst.instance_id}
                      className="flex items-center justify-between p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Server size={14} className="text-emerald-400" />
                        <div>
                          <span className="text-sm font-medium text-slate-200">
                            {inst.name || inst.instance_id}
                          </span>
                          <span className="text-xs text-slate-500 ml-2">
                            {inst.instance_type} • {inst.state}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs bg-emerald-500/15 text-emerald-400 px-2.5 py-1 rounded-full font-medium">
                        ✅ Ready
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unmatched Instances */}
            {matchResults.unmatched.length > 0 && (
              <div className="glass-panel rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800/50 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-400" />
                  <h3 className="font-semibold text-amber-400 text-sm">
                    Unmatched Instances — Different PEM Required ({matchResults.unmatched.length})
                  </h3>
                </div>
                <div className="p-4 space-y-2">
                  {matchResults.unmatched.map((inst) => (
                    <div
                      key={inst.instance_id}
                      className="flex items-center justify-between p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Server size={14} className="text-amber-400" />
                        <div>
                          <span className="text-sm font-medium text-slate-200">
                            {inst.instance_id}
                          </span>
                          <p className="text-xs text-amber-400/80 mt-0.5">
                            {inst.message}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs bg-amber-500/15 text-amber-400 px-2.5 py-1 rounded-full font-medium">
                        ⚠️ Upload PEM
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upload Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="glass-panel rounded-2xl w-full max-w-lg p-6 space-y-5 animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
                  <Upload size={18} className="text-indigo-400" />
                  Upload PEM Key
                </h2>
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    resetForm();
                  }}
                  className="p-1.5 text-slate-500 hover:text-slate-300 rounded-lg"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Key Name */}
              <div>
                <label className="text-sm font-medium text-slate-300 block mb-1.5">
                  Key Name
                </label>
                <input
                  type="text"
                  value={keyName}
                  onChange={(e) => setKeyName(e.target.value)}
                  placeholder="e.g., Production Key, Dev Environment"
                  className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                />
              </div>

              {/* AWS Account ID */}
              <div>
                <label className="text-sm font-medium text-slate-300 block mb-1.5">
                  AWS Account ID
                </label>
                <input
                  type="text"
                  value={awsAccountId}
                  onChange={(e) => setAwsAccountId(e.target.value)}
                  placeholder="e.g., 123456789012"
                  className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all font-mono"
                />
              </div>

              {/* PEM File Upload */}
              <div>
                <label className="text-sm font-medium text-slate-300 block mb-1.5">
                  PEM File
                </label>
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragOver(true);
                  }}
                  onDragLeave={() => setIsDragOver(false)}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-all cursor-pointer ${
                    isDragOver
                      ? "border-indigo-500/50 bg-indigo-500/5"
                      : pemFileName
                      ? "border-emerald-500/30 bg-emerald-500/5"
                      : "border-slate-700/50 hover:border-slate-600/50"
                  }`}
                  onClick={() => document.getElementById("pem-file-input").click()}
                >
                  <input
                    id="pem-file-input"
                    type="file"
                    accept=".pem,.key"
                    className="hidden"
                    onChange={(e) => handleFileSelect(e.target.files[0])}
                  />
                  {pemFileName ? (
                    <div className="flex items-center justify-center gap-2 text-emerald-400">
                      <FileKey size={20} />
                      <span className="text-sm font-medium">{pemFileName}</span>
                      <CheckCircle2 size={16} />
                    </div>
                  ) : (
                    <>
                      <Upload
                        size={24}
                        className="text-slate-500 mx-auto mb-2"
                      />
                      <p className="text-sm text-slate-400">
                        Drag & drop your .pem file here
                      </p>
                      <p className="text-xs text-slate-600 mt-1">
                        or click to browse
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Upload Button */}
              <button
                onClick={handleUpload}
                disabled={isUploading || !keyName || !awsAccountId || !pemContent}
                className="w-full py-3 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 border border-indigo-500/30 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isUploading ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Encrypting & Uploading...
                  </>
                ) : (
                  <>
                    <Shield size={16} />
                    Encrypt & Upload
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
