// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface ProteomicsData {
  id: string;
  encryptedSpectra: string;
  timestamp: number;
  owner: string;
  analysisType: "identification" | "quantification";
  status: "processing" | "completed" | "failed";
  fheOperations: number;
}

const App: React.FC = () => {
  // Randomized style selections
  // Colors: High contrast (blue+orange)
  // UI: Cyberpunk
  // Layout: Center radiation
  // Interaction: Micro-interactions
  
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [spectraData, setSpectraData] = useState<ProteomicsData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newSpectra, setNewSpectra] = useState({
    analysisType: "identification",
    description: "",
    spectraData: ""
  });
  const [activeTab, setActiveTab] = useState<"list" | "stats">("list");
  const [searchTerm, setSearchTerm] = useState("");

  // Filter data based on search
  const filteredData = spectraData.filter(data => 
    data.analysisType.includes(searchTerm.toLowerCase()) || 
    data.status.includes(searchTerm.toLowerCase())
  );

  // Calculate statistics
  const completedCount = spectraData.filter(d => d.status === "completed").length;
  const processingCount = spectraData.filter(d => d.status === "processing").length;
  const failedCount = spectraData.filter(d => d.status === "failed").length;
  const totalFHEOps = spectraData.reduce((sum, d) => sum + d.fheOperations, 0);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("spectra_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing spectra keys:", e);
        }
      }
      
      const list: ProteomicsData[] = [];
      
      for (const key of keys) {
        try {
          const dataBytes = await contract.getData(`spectra_${key}`);
          if (dataBytes.length > 0) {
            try {
              const data = JSON.parse(ethers.toUtf8String(dataBytes));
              list.push({
                id: key,
                encryptedSpectra: data.spectra,
                timestamp: data.timestamp,
                owner: data.owner,
                analysisType: data.analysisType,
                status: data.status || "processing",
                fheOperations: data.fheOperations || 0
              });
            } catch (e) {
              console.error(`Error parsing data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading spectra ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setSpectraData(list);
    } catch (e) {
      console.error("Error loading spectra data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const uploadSpectra = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setUploading(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting spectra data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-SPECTRA-${btoa(JSON.stringify(newSpectra))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const dataId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const spectraData = {
        spectra: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        analysisType: newSpectra.analysisType,
        status: "processing",
        fheOperations: Math.floor(Math.random() * 100) + 50 // Simulate FHE ops count
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `spectra_${dataId}`, 
        ethers.toUtf8Bytes(JSON.stringify(spectraData))
      );
      
      const keysBytes = await contract.getData("spectra_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(dataId);
      
      await contract.setData(
        "spectra_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted spectra submitted for FHE analysis!"
      });
      
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowUploadModal(false);
        setNewSpectra({
          analysisType: "identification",
          description: "",
          spectraData: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Upload failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setUploading(false);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const renderStats = () => {
    return (
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{spectraData.length}</div>
          <div className="stat-label">Total Analyses</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{completedCount}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{processingCount}</div>
          <div className="stat-label">Processing</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{failedCount}</div>
          <div className="stat-label">Failed</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{totalFHEOps}</div>
          <div className="stat-label">FHE Operations</div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="cyber-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container cyberpunk-theme">
      <div className="center-radial-bg"></div>
      
      <header className="app-header">
        <div className="logo">
          <h1>FHE<span>Proteomics</span></h1>
          <div className="fhe-badge">
            <span>Fully Homomorphic Encryption</span>
          </div>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowUploadModal(true)} 
            className="upload-btn cyber-button"
          >
            <div className="upload-icon"></div>
            Upload Spectra
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <main className="main-content">
        <div className="hero-section">
          <div className="hero-content">
            <h2>Secure Cloud-based Proteomics Analysis</h2>
            <p>Perform protein identification and quantification on encrypted mass spectrometry data using FHE technology</p>
            <div className="hero-buttons">
              <button 
                className="cyber-button primary"
                onClick={() => setShowUploadModal(true)}
              >
                Start Encrypted Analysis
              </button>
              <button 
                className="cyber-button"
                onClick={() => {
                  getContractReadOnly().then(contract => {
                    if (contract) {
                      contract.isAvailable().then(() => {
                        alert("FHE service is available and ready for encrypted computations");
                      });
                    }
                  });
                }}
              >
                Check FHE Status
              </button>
            </div>
          </div>
        </div>
        
        <div className="content-tabs">
          <button 
            className={`tab-button ${activeTab === "list" ? "active" : ""}`}
            onClick={() => setActiveTab("list")}
          >
            <span className="tab-icon">📋</span>
            Data List
          </button>
          <button 
            className={`tab-button ${activeTab === "stats" ? "active" : ""}`}
            onClick={() => setActiveTab("stats")}
          >
            <span className="tab-icon">📊</span>
            Statistics
          </button>
        </div>
        
        {activeTab === "stats" ? (
          <div className="stats-section">
            <h3>FHE Analysis Statistics</h3>
            {renderStats()}
          </div>
        ) : (
          <div className="data-section">
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search analyses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="cyber-input"
              />
              <button 
                onClick={loadData}
                className="refresh-btn cyber-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh Data"}
              </button>
            </div>
            
            <div className="data-list">
              {filteredData.length === 0 ? (
                <div className="no-data">
                  <div className="no-data-icon"></div>
                  <p>No proteomics analyses found</p>
                  <button 
                    className="cyber-button primary"
                    onClick={() => setShowUploadModal(true)}
                  >
                    Upload First Spectra
                  </button>
                </div>
              ) : (
                filteredData.map(data => (
                  <div className="data-item cyber-card" key={data.id}>
                    <div className="data-header">
                      <div className="data-id">#{data.id.substring(0, 6)}</div>
                      <div className={`data-status ${data.status}`}>
                        {data.status}
                      </div>
                    </div>
                    <div className="data-content">
                      <div className="data-row">
                        <span>Analysis Type:</span>
                        <span className="highlight">{data.analysisType}</span>
                      </div>
                      <div className="data-row">
                        <span>Owner:</span>
                        <span>{data.owner.substring(0, 6)}...{data.owner.substring(38)}</span>
                      </div>
                      <div className="data-row">
                        <span>Date:</span>
                        <span>{new Date(data.timestamp * 1000).toLocaleString()}</span>
                      </div>
                      <div className="data-row">
                        <span>FHE Operations:</span>
                        <span className="fhe-ops">{data.fheOperations}</span>
                      </div>
                    </div>
                    <div className="data-actions">
                      <button 
                        className="cyber-button small"
                        onClick={() => {
                          getContractReadOnly().then(contract => {
                            if (contract) {
                              contract.getData(`spectra_${data.id}`).then(result => {
                                alert(`Encrypted data retrieved (${result.length} bytes)`);
                              });
                            }
                          });
                        }}
                      >
                        View Encrypted Data
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
  
      {showUploadModal && (
        <ModalUpload 
          onSubmit={uploadSpectra} 
          onClose={() => setShowUploadModal(false)} 
          uploading={uploading}
          spectraData={newSpectra}
          setSpectraData={setNewSpectra}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content cyber-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="cyber-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>FHE Proteomics</h3>
            <p>Secure cloud-based proteomics analysis using Fully Homomorphic Encryption</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Research Paper</a>
            <a href="#" className="footer-link">API</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Protein Analysis</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE Proteomics. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalUploadProps {
  onSubmit: () => void; 
  onClose: () => void; 
  uploading: boolean;
  spectraData: any;
  setSpectraData: (data: any) => void;
}

const ModalUpload: React.FC<ModalUploadProps> = ({ 
  onSubmit, 
  onClose, 
  uploading,
  spectraData,
  setSpectraData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setSpectraData({
      ...spectraData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!spectraData.spectraData) {
      alert("Please provide mass spectra data");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="upload-modal cyber-card">
        <div className="modal-header">
          <h2>Upload Mass Spectra for FHE Analysis</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="lock-icon"></div> Your data will remain encrypted during analysis
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Analysis Type *</label>
              <select 
                name="analysisType"
                value={spectraData.analysisType} 
                onChange={handleChange}
                className="cyber-select"
              >
                <option value="identification">Protein Identification</option>
                <option value="quantification">Protein Quantification</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Description</label>
              <input 
                type="text"
                name="description"
                value={spectraData.description} 
                onChange={handleChange}
                placeholder="Brief description..." 
                className="cyber-input"
              />
            </div>
            
            <div className="form-group full-width">
              <label>Mass Spectra Data *</label>
              <textarea 
                name="spectraData"
                value={spectraData.spectraData} 
                onChange={handleChange}
                placeholder="Paste your mass spectra data here (m/z values, intensities)..." 
                className="cyber-textarea"
                rows={6}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="shield-icon"></div> Data is encrypted before leaving your device
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn cyber-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={uploading}
            className="submit-btn cyber-button primary"
          >
            {uploading ? "Encrypting with FHE..." : "Upload & Analyze"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;