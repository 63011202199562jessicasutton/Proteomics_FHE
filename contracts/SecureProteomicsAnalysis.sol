// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract SecureProteomicsAnalysis is SepoliaConfig {
    struct EncryptedSpectrum {
        uint256 id;
        euint32 encryptedData;       // Encrypted spectral data
        euint32 encryptedProteinId;  // Encrypted protein identifier
        euint32 encryptedQuantity;   // Encrypted quantitative value
        uint256 timestamp;
    }
    
    struct DecryptedResult {
        uint32 proteinId;
        uint32 quantity;
        bool isRevealed;
    }

    uint256 public spectrumCount;
    mapping(uint256 => EncryptedSpectrum) public encryptedSpectra;
    mapping(uint256 => DecryptedResult) public decryptedResults;
    
    mapping(uint32 => euint32) private encryptedProteinCounts;
    uint32[] private proteinList;
    
    mapping(uint256 => uint256) private requestToSpectrumId;
    
    event SpectrumUploaded(uint256 indexed id, uint256 timestamp);
    event DecryptionRequested(uint256 indexed id);
    event ResultDecrypted(uint256 indexed id);
    
    /// @notice Submit encrypted proteomics data
    function submitEncryptedSpectrum(
        euint32 encryptedData,
        euint32 encryptedProteinId,
        euint32 encryptedQuantity
    ) public {
        spectrumCount += 1;
        uint256 newId = spectrumCount;
        
        encryptedSpectra[newId] = EncryptedSpectrum({
            id: newId,
            encryptedData: encryptedData,
            encryptedProteinId: encryptedProteinId,
            encryptedQuantity: encryptedQuantity,
            timestamp: block.timestamp
        });
        
        decryptedResults[newId] = DecryptedResult({
            proteinId: 0,
            quantity: 0,
            isRevealed: false
        });
        
        emit SpectrumUploaded(newId, block.timestamp);
    }
    
    /// @notice Request decryption of analysis results
    function requestResultDecryption(uint256 spectrumId) public {
        EncryptedSpectrum storage spectrum = encryptedSpectra[spectrumId];
        require(!decryptedResults[spectrumId].isRevealed, "Results already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(spectrum.encryptedProteinId);
        ciphertexts[1] = FHE.toBytes32(spectrum.encryptedQuantity);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptAnalysisResult.selector);
        requestToSpectrumId[reqId] = spectrumId;
        
        emit DecryptionRequested(spectrumId);
    }
    
    /// @notice Process decrypted analysis results
    function decryptAnalysisResult(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 spectrumId = requestToSpectrumId[requestId];
        require(spectrumId != 0, "Invalid request");
        
        EncryptedSpectrum storage eSpectrum = encryptedSpectra[spectrumId];
        DecryptedResult storage dResult = decryptedResults[spectrumId];
        require(!dResult.isRevealed, "Results already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (uint32 proteinId, uint32 quantity) = abi.decode(cleartexts, (uint32, uint32));
        
        dResult.proteinId = proteinId;
        dResult.quantity = quantity;
        dResult.isRevealed = true;
        
        if (!FHE.isInitialized(encryptedProteinCounts[proteinId])) {
            encryptedProteinCounts[proteinId] = FHE.asEuint32(0);
            proteinList.push(proteinId);
        }
        encryptedProteinCounts[proteinId] = FHE.add(
            encryptedProteinCounts[proteinId], 
            FHE.asEuint32(1)
        );
        
        emit ResultDecrypted(spectrumId);
    }
    
    /// @notice Retrieve decrypted analysis results
    function getDecryptedResult(uint256 spectrumId) public view returns (
        uint32 proteinId,
        uint32 quantity,
        bool isRevealed
    ) {
        DecryptedResult storage r = decryptedResults[spectrumId];
        return (r.proteinId, r.quantity, r.isRevealed);
    }
    
    /// @notice Get encrypted protein occurrence count
    function getEncryptedProteinCount(uint32 proteinId) public view returns (euint32) {
        return encryptedProteinCounts[proteinId];
    }
    
    /// @notice Request protein count decryption
    function requestProteinCountDecryption(uint32 proteinId) public {
        euint32 count = encryptedProteinCounts[proteinId];
        require(FHE.isInitialized(count), "Protein not found");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(count);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptProteinCount.selector);
        requestToSpectrumId[reqId] = uint256(proteinId);
    }
    
    /// @notice Process decrypted protein count
    function decryptProteinCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint32 proteinId = uint32(requestToSpectrumId[requestId]);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32 count = abi.decode(cleartexts, (uint32));
        // Handle decrypted protein count as needed
    }
}