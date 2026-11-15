# CREDVAIL — Research Methodology & Empirical Evaluation Framework

**Project Title:** Blockchain-Verified, Privacy-Preserving Digital Credential Infrastructure  
**Document:** Academic Thesis Methodology, Research Hypotheses & Benchmark Protocol  
**Document Version:** 1.0.0  
**Phase:** Phase 0 (Technical Planning)  

---

## 1. Academic Problem Statement & Thesis Context

Digital credentials are fundamentally shifting from paper documents and static raster PDFs to machine-verifiable digital assets. However, current implementations face an architectural trilemma between:
1. **Computational & Cost Scalability:** Direct on-chain writes scale linearly ($O(N)$ gas fees), rendering institutional batch issuance economically unviable on public blockchains.
2. **Revocation Freshness:** Off-chain caching introduces stale state risks where revoked credentials continue to verify as valid.
3. **Privacy & Selective Disclosure:** Revealing complete verifiable credentials leaks extraneous personal identifiers (PII), violating data minimization principles (e.g., GDPR Article 5(1)(c)).

CREDVAIL formalizes a novel framework:
> **"Freshness-Aware Multi-Tenant Issuer-Key Governance and Dual-Layer Blockchain-Anchored Status Verification."**

---

## 2. Research Hypotheses

### Hypothesis 1: Gas Cost & Scalability Optimization ($H_1$)
- **Formulation:** Anchoring an issuance batch of $N$ credentials using a single Keccak-256 Merkle root in conjunction with periodic W3C Bitstring Status List commitments on Ethereum Sepolia achieves greater than a $98\%$ reduction in gas consumption compared to individual on-chain credential registration for $N \ge 100$.
  $$\Delta \text{Gas}(N) = 1 - \frac{\text{Gas}_{\text{BatchMerkle}}}{\sum_{i=1}^N \text{Gas}_{\text{Individual}}(i)} \ge 0.98 \quad (\forall N \ge 100)$$

### Hypothesis 2: Privacy Preservation & Network Wire Efficiency ($H_2$)
- **Formulation:** Utilizing the W3C `ecdsa-sd-2023` cryptosuite for selective disclosure reduces presentation payload size by at least $40\%$ compared to full credential disclosure when presenting $k \le \frac{M}{2}$ claims out of $M$ total claims, while preserving zero-knowledge cryptographic unforgeability.
  $$\text{PayloadReduction} = \frac{\text{Bytes}(\text{FullVC}) - \text{Bytes}(\text{SD\_Presentation})}{\text{Bytes}(\text{FullVC})} \ge 0.40$$

### Hypothesis 3: Freshness & Replay Attack Resilience ($H_3$)
- **Formulation:** The dual-condition verification engine—requiring both on-chain status digest epoch parity and CSPRNG challenge nonce consumption—achieves a $100\%$ detection rate ($0\%$ false positive / false negative rate) against adversarial replay and stale revocation attacks.

---

## 3. Quantitative Evaluation Metrics ($M_1$ to $M_7$)

| Metric ID | Variable Name | Unit of Measure | Measurement Apparatus | Target Acceptance Threshold |
| :---: | :--- | :---: | :--- | :--- |
| **M1** | Full Verification Latency | Milliseconds ($\text{ms}$) | High-resolution timer (`performance.now()`), $1,000$ iterations | Median $< 250\text{ ms}$, p95 $< 600\text{ ms}$ |
| **M2** | Selective Disclosure Payload | Bytes ($\text{B}$) | Binary wire byte counter on HTTP transmission body | $\ge 40\%$ reduction vs Full VC |
| **M3** | Generation Pipeline Throughput | Certs / Second ($\text{cps}$) | Node.js Worker pool stress harness ($N=1,000$) | $\ge 30\text{ certs/sec}$ |
| **M4** | Merkle Proof Verification | Milliseconds ($\text{ms}$) | In-memory EVM & Node.js test harness ($k=4 \dots 16$) | $< 2\text{ ms}$ per inclusion proof |
| **M5** | Smart Contract Gas Cost | Gas units ($\text{gas}$) | Foundry gas snapshot (`forge test --gas-report`) | Batch root $< 65,000\text{ gas}$ |
| **M6** | Revocation Detection Latency | Seconds ($\text{s}$) | End-to-end integration test runner | $< 1.0\text{ second}$ local propagation |
| **M7** | Adversarial Rejection Rate | Percentage ($\%$) | 10-vector security test suite ($1,000$ trials) | $100.0\%$ rejection ($0\%$ false pass) |

---

## 4. Experimental Setup & Benchmarking Protocol

### 4.1 Controlled Environment
- **Hardware Reference:** AMD/Intel 8+ core CPU, 16 GB RAM, NVMe SSD.
- **Node.js Environment:** Node v24 LTS (x64) with native V8 optimization flags.
- **Network Environment:** Ethereum Sepolia Testnet (RPC: Alchemy/Infura) and local Anvil dev node for zero-jitter baseline measurements.

### 4.2 Statistical Rigor
- Every latency measurement will run for $N=1,000$ iterations after a warm-up phase of $100$ iterations to eliminate JIT compilation skew.
- Reporting will present **Mean**, **Standard Deviation**, **Median (p50)**, **p95**, and **p99**.
- Non-parametric statistical tests (e.g., Wilcoxon signed-rank test, $p < 0.01$) will be used to demonstrate statistical significance when comparing full presentation vs selective disclosure payloads.

---

## 5. Raw Data Export & Thesis Artifacts

The benchmarking suite will automatically output:
1. `benchmarks/results/latency_results.json`
2. `benchmarks/results/gas_analysis.csv`
3. `benchmarks/results/throughput_matrix.json`
4. `benchmarks/results/adversarial_matrix.json`

These artifacts will be formatted for direct inclusion as tables and charts in the undergraduate thesis dissertation document.
