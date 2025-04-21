import { useState } from "react";
import Heading from "@theme/Heading";
import styles from "./styles.module.css";

const simulatorPapers = [
  {
    title:
      "Looking into the Black Box: Monitoring Computer Architecture Simulations in Real-Time with AkitaRTM",
    authors: "Ali Mosallaei; Katherine E. Isaacs; Yifan Sun",
    link: "https://ieeexplore.ieee.org/abstract/document/10764426",
    year: 2024,
  },
  {
    title:
      "Photon: A fine-grained sampled simulation methodology for gpu workloads",
    authors: "Changxi Liu, Yifan Sun, Trevor E. Carlson",
    link: "https://dl.acm.org/doi/pdf/10.1145/3613424.3623773",
    year: 2023,
  },
  {
    title:
      "Visual Exploratory Analysis for Designing Large-Scale Network-on-Chip Architectures: A Domain Expert-Led Design Study",
    authors: "Shaoyu Wang, Hang Yan, Katherine E. Isaacs, Yifan Sun",
    link: "https://ieeexplore.ieee.org/abstract/document/10330046",
    year: 2023,
  },
  {
    title: "Navisim: A Highly Accurate GPU Simulator for AMD RDNA GPUs",
    authors:
      "Yuhui Bao, Yifan Sun, Zlatan Feric, Michael Tian Shen, Micah Weston, Jose, L. Abellan, Trinayan Baruah, John Kim, Ajay Joshi, David Kaeli",
    link: "https://michaeltshen.github.io/Files/NaviSim.pdf",
    year: 2022,
  },
  {
    title: "Daisen: A Framework for Visualizing Detailed GPU Execution",
    authors:
      "Yifan Sun, Yixuan Zhang, Ali Mosallaei, Michael D. Shah, Cody Dunne, and David Kaeli",
    link: "https://onlinelibrary.wiley.com/doi/abs/10.1111/cgf.14303",
    year: 2021,
  },
  {
    title: "RISC-V Microarchitecture Simulation State Enumeration",
    authors: "Griffin Knipe, Derek Rodriguez, Yunsi Fei, David Kaeli",
    link: "https://par.nsf.gov/servlets/purl/10280203",
    year: 2021,
  },
  {
    title: "MGPUSim: Enabling Multi-GPU Performance Modeling and Optimization",
    authors:
      "Yifan Sun, Trinayan Baruah, Saiful A. Mojumder, Shi Dong, Xiang Gong, Shane Treadway, Yuhui Bao, Spencer Hance, Carter McCardwell, Vincent Zhao, Harrison Barclay, Amir Kavyan Ziabari, Zhongliang Chen, Rafael Ubal, José L. Abellán, John Kim, Ajay Joshi, David Kaeli",
    link: "https://dl.acm.org/doi/abs/10.1145/3307650.3322230",
    year: 2019,
  },
];

const designPapers = [
  {
    title:
      "ACTA: Automatic Configuration of the Tensor Memory Accelerator for High-End GPUs",
    authors:
      "Nicolás Meseguer, Yifan Sun, Michael Pellauer, José L. Abellán, Manuel E. Acacio",
    link: "https://digitum.um.es/digitum/bitstream/10201/150921/1/preprint_tma_gpgpu_2025.pdf",
    year: 2025,
  },
  {
    title: "Exploring the Wafer-Scale GPU",
    authors: "Daoxuan Xu, Le Xu, Jie Ren, Yifan Sun",
    link: "https://sarchlab.org/wafer_scale_gpu_gpgpu.pdf",
    year: 2025,
  },
  {
    title: "OASIS: Object-Aware Page Management for Multi-GPU Systems",
    authors:
      "Yueqi Wang, Bingyao Li, Mohamed Tarek Ibn Ziad, Lieven Eeckhout, Jun Yang, Aamer Jaleel, Xulong Tang",
    link: "https://users.elis.ugent.be/~leeckhou/papers/HPCA2025-OASIS.pdf",
    year: 2025,
  },
  {
    title:
      "REC: Enhancing fine-grained cache coherence protocol in multi-GPU systems",
    authors: "Gun Ko, Jiwon Lee, Hongju Kal, Hyunwuk Lee, Won Woo Ro",
    link: "https://www.sciencedirect.com/science/article/abs/pii/S1383762125000116",
    year: 2025,
  },
  {
    title: "STAR: Sub-Entry Sharing-Aware TLB for Multi-Instance GPU",
    authors:
      "Bingyao Li, Yueqi Wang, Tianyu Wang, Lieven Eeckout, Jun Yang, Aamer Jaleel, Xulong Tang",
    link: "https://users.elis.ugent.be/~leeckhou/papers/MICRO2024-STAR.pdf",
    year: 2024,
  },
  {
    title:
      "Barre Chord: Efficient Virtual Memory Translation for Multi-Chip-Module GPUs",
    authors: "Yuan Feng, Seonjin Na, Hyesoon Kim, Hyeran Jeon",
    link: "https://seonjinna.github.io/assets/pdf/BarreChord_isca24.pdf",
    year: 2024,
  },
  {
    title:
      "GRIT: Enhancing Multi-GPU Performance with Fine-Grained Dynamic Page Placement",
    authors: "Yueqi Wang, Bingyao Li, Aamer Jaleel, Jun Yang, Xulong Tang",
    link: "https://ieeexplore.ieee.org/abstract/document/10476474",
    year: 2024,
  },
  {
    title:
      "Supporting Secure Multi-GPU Computing with Dynamic and Batched Metadata Management",
    authors: "Seonjin Na, Jungwoo Kim, Sunho Lee, Jaehyuk Huh",
    link: "https://myshlee417.github.io/files/multi_gpu_security_hpca_2024.pdf",
    year: 2024,
  },
  {
    title:
      "Improving Multi-Instance GPU Efficiency via Sub-Entry Sharing TLB Design",
    authors:
      "Bingyao Li, Yueqi Wang, Tianyu Wang, Lieven Eeckhout, Jun Yang, Aamer Jaleel, Xulong Tang",
    link: "https://arxiv.org/abs/2404.18361",
    year: 2024,
  },
  {
    title:
      "Implementation and Optimization of 8× 8 Block Discrete Cosine Transform on MGPUSim",
    authors: "Shuang Yang, Yaobin Wang, Ling Li, Jiawei Qin, Guotang Bi",
    link: "https://ieeexplore.ieee.org/abstract/document/10885061",
    year: 2024,
  },
  {
    title:
      "Accelerating Sparse Matrix-Matrix Multiplication by Adaptive Batching Strategy on MGPUSim",
    authors:
      "Tianhai Wang, Yaobin Wang, Yutao Peng, Yingchen Song, Qian Peng, Pingping Tang",
    link: "https://ieeexplore.ieee.org/abstract/document/10917821",
    year: 2024,
  },
  {
    title:
      "Trans-FW: Short Circuiting Page Table Walk in Multi-GPU Systems via Remote Forwarding",
    authors:
      "Bingyao Li, Jieming Yin, Anup Holey, Youtao Zhang, Jun Yang, Xulong Tang",
    link: "https://ieeexplore.ieee.org/abstract/document/10071054",
    year: 2023,
  },
  {
    title:
      "GME: GPU-Based Microarchitectural Extensions to Accelerate Homomorphic Encryption",
    authors:
      "Kaustubh Shivdikar, Yuhui Bao, Rashmi Agrawal, Michael Shen, Gilbert Jonatan, Evelio Mora, Alexander Ingare, Neal Livesay, José L. Abellán, John Kim, Ajay Joshi, David Kaeli",
    link: "https://dl.acm.org/doi/pdf/10.1145/3613424.3614279",
    year: 2023,
  },
  {
    title:
      "Idyll: Enhancing page translation in multi-gpus via light weight pte invalidations",
    authors:
      "Bingyao Li, Yanan Guo, Yueqi Wang, Aamer Jaleel, Jun Yang, Xulong Tang",
    link: "https://dl.acm.org/doi/pdf/10.1145/3613424.3614269",
    year: 2023,
  },
  {
    title: "Understanding Scalability of Multi-GPU Systems",
    authors: "Yuan Feng, Hyeran Jeon",
    link: "https://dl.acm.org/doi/pdf/10.1145/3589236.3589237",
    year: 2023,
  },
  {
    title:
      "The Parallelization and Optimization of K-means Algorithm Based on MGPUSim",
    authors:
      "Zhangbin Mo, Yaobin Wang, Qingming Zhang, Guangbing Zhang, Mingfeng Guo, Yaqing Zhang, Chao Shen",
    link: "https://link.springer.com/chapter/10.1007/978-3-031-15937-4_26",
    year: 2022,
  },
  {
    title: "Dynamic GMMU Bypass for Address Translation in Multi-GPU Systems",
    authors: "Jinhui Wei, Jianzhuang Lu, Qi Yu, Chen Li, Yunping Zhao",
    link: "https://inria.hal.science/hal-03768734/document",
    year: 2022,
  },
  {
    title:
      "Understanding Wafer-Scale GPU Performance using an Architectural Simulator",
    authors: "Chris Thames, Hang Yan, Yifan Sun",
    link: "https://dl.acm.org/doi/abs/10.1145/3530390.3532736",
    year: 2022,
  },
  {
    title:
      "Improving address translation in multi-gpus via sharing and spilling aware tlb design",
    authors: "Bingyao Li, Jieming Yin, Youtao Zhang, Xulong Tang",
    year: 2021,
  },
  {
    title:
      "Grus: Toward Unified-Memory-Efficient High-Performance Graph Processing on GPU",
    authors:
      "Pengyu Wang, Jing Wang, Chao Li, Jianzong Wang, Haojin Zhu, Minyi Guo",
    link: "https://dl.acm.org/doi/pdf/10.1145/3444844",
    year: 2021,
  },
  {
    title:
      "Spartan: A Sparsity-Adaptive Framework to Accelerate Deep Neural Network Training on GPUs",
    authors:
      "Shi Dong, Yifan Sun, Nicolas Bohm Agostini, Elmira Karimi, Daniel Lowell, Jing Zhou, José Cano, José L. Abellán, David Kaeli",
    link: "https://ieeexplore.ieee.org/abstract/document/9382871",
    year: 2021,
  },
  {
    title:
      "HALCONE : A Hardware-Level Timestamp-based Cache Coherence Scheme for Multi-GPU Systems",
    authors:
      "Saiful A. Mojumder, Yifan Sun, Leila Delshadtehrani, Yenai Ma, Trinayan Baruah, José L. Abellán, John Kim, David Kaeli, Ajay Joshi",
    link: "https://arxiv.org/abs/2007.04292",
    year: 2020,
  },
  {
    title: "MGPU-TSM: A Multi-GPU System with Truly Shared Memory",
    authors:
      "Saiful A. Mojumder, Yifan Sun, Leila Delshadtehrani, Yenai Ma, Trinayan Baruah, José L. Abellán, John Kim, David Kaeli, Ajay Joshi",
    link: "https://arxiv.org/abs/2008.02300",
    year: 2020,
  },
  {
    title: "Priority-Based PCIe Scheduling for Multi-Tenant Multi-GPU Systems",
    authors:
      "Chen Li , Yifan Sun , Lingling Jin, Lingjie Xu, Zheng Cao , Pengfei Fan, David Kaeli , Sheng Ma , Yang Guo, and Jun Yang",
    link: "https://par.nsf.gov/servlets/purl/10216628",
    year: 2019,
  },
  {
    title:
      "Griffin: Hardware-software support for efficient page migration in multi-gpu systems",
    authors:
      "Trinayan Baruah, Yifan Sun, Ali Tolga Dinçer, Saiful A. Mojumder, José L. Abellán, Yash Ukidave, Ajay Joshi, Norman Rubin, John Kim, David Kaeli",
    link: "https://ieeexplore.ieee.org/abstract/document/9065453",
    year: 2020,
  },
  {
    title: "Valkyrie: Leveraging Inter-TLB Locality to Enhance GPU Performance",
    authors:
      "Trinayan Baruah, Yifan Sun, Saiful A. Mojumder, José L. Abellán, Yash Ukidave, Ajay Joshi, Norman Rubin, John Kim, David Kaeli",
    link: "https://people.bu.edu/joshi/files/pactfp17-baruahA.pdf",
    year: 2020,
  },
];

function PaperList({ papers }) {
  const [showAll, setShowAll] = useState(false);
  const displayPapers = showAll ? papers : papers.slice(0, 5);

  return (
    <>
      <ul className={styles.paperList}>
        {displayPapers.map((props, idx) => (
          <li key={idx}>
            {props.year && (
              <span className={styles.paperYear}>{props.year}</span>
            )}
            ,{" "}
            {props.link ? (
              <a
                href={props.link}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.paperTitle}
              >
                {props.title}
              </a>
            ) : (
              <span>{props.title}</span>
            )}
            ,{" "}
            {props.authors.length > 40
              ? `${props.authors.substring(0, 40)}...`
              : props.authors}
          </li>
        ))}
      </ul>
      {papers.length > 5 && (
        <div className={styles.showMoreContainer}>
          <button
            onClick={() => setShowAll(!showAll)}
            className={styles.showMoreButton}
          >
            {showAll ? "Show less" : `Show more... (${papers.length - 5} more)`}
          </button>
        </div>
      )}
    </>
  );
}

export default function HomepageSimulators() {
  return (
    <section className="section">
      <div className="sectionContent">
        <h2 className="sectionTitle">Publications</h2>
        <div className="row">
          <div className={styles.col}>
            <div className={styles.paperCount}>#{simulatorPapers.length}</div>
            <h3 className="subsectionTitle">
              Papers that Design/Improve Simulators
            </h3>
            <PaperList papers={simulatorPapers} />
          </div>
          <div className={styles.col}>
            <div className={styles.paperCount}>#{designPapers.length}</div>
            <h3 className="subsectionTitle">
              Papers that use Akita Simulators
            </h3>
            <PaperList papers={designPapers} />
          </div>
        </div>
      </div>
    </section>
  );
}
