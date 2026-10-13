export interface SampleSyllabus {
  id: string;
  name: string;
  courseCode: string;
  description: string;
  text: string;
}

export const SAMPLE_SYLLABI: SampleSyllabus[] = [
  {
    id: 'cs106b',
    name: 'CS 106B: Programming Abstractions in C++',
    courseCode: 'CS 106B',
    description: 'Stanford style introductory data structures & algorithms course with 7 coding assignments and 2 exams.',
    text: `CS 106B: Programming Abstractions
Autumn Quarter 2026 | Stanford University
Instructor: Dr. Julie Zelenski (zelenski@cs.stanford.edu)
Lectures: MWF 1:30 - 2:20 PM | Gates B01

COURSE OVERVIEW
CS106B continues the study of computer science begun in CS106A, focusing on advanced software engineering techniques and data structures. Topics include algorithmic analysis, recursion, memory management, abstract data types (stacks, queues, sets, maps, priority queues), linked lists, trees, graphs, and hashing.

GRADING POLICY
Your final grade is computed according to the following weights:
- Programming Assignments (7 total): 45%
- Midterm Diagnostic Exam: 20%
- Final Comprehensive Examination: 30%
- Discussion Section & Weekly Participation: 5%

IMPORTANT DATES & DEADLINES
Assignment 1: Game of Life & Soundex
Due: 2026-09-29 | Type: Programming Homework | Weight: 6%

Assignment 2: Word Ladders and Random Writer (ADTs)
Due: 2026-10-09 | Type: Homework | Weight: 6%

Assignment 3: Meta-Recursion & Boggle Solver
Due: 2026-10-20 | Type: Project | Weight: 7%

Midterm Examination (In-class Diagnostic)
Date: 2026-10-22 (7:00 PM - 9:00 PM) | Type: Exam | Weight: 20%

Assignment 4: Priority Queues with Binary Heaps
Due: 2026-10-30 | Type: Homework | Weight: 6%

Assignment 5: Huffman Data Compression
Due: 2026-11-12 | Type: Project | Weight: 7%

Assignment 6: Pathfinding with Breadth-First & Dijkstra
Due: 2026-11-24 | Type: Homework | Weight: 7%

Assignment 7: Custom Data Structures Final Challenge
Due: 2026-12-04 | Type: Project | Weight: 6%

Final Comprehensive Examination
Date: 2026-12-08 (8:30 AM - 11:30 AM) | Type: Exam | Weight: 30%`,
  },
  {
    id: 'bio81',
    name: 'BIO 81: Ecology and Evolutionary Biology',
    courseCode: 'BIO 81',
    description: 'Life sciences course with lab reports, field survey project, midterms, and weekly quizzes.',
    text: `Biology 81: Ecology and Evolutionary Mechanisms
Instructor: Prof. Tadashi Fukami (fukami@stanford.edu)
Teaching Assistants: Sarah Chen, David Miller

GRADING SCHEME
- Midterm Exam 1: 15%
- Midterm Exam 2: 15%
- Final Exam: 25%
- Weekly Laboratory Reports (8 reports): 25%
- Campus Biodiversity Field Survey Project: 15%
- Reading Quizzes (Canvas): 5%

SCHEDULE OF ASSIGNMENTS & EXAMS
- Quiz 1 (Speciation & Darwinian Selection): Due 2026-10-06 | Quiz | Weight: 1%
- Lab Report 1: Population Genetics & Hardy-Weinberg: Due 2026-10-10 | Homework | Weight: 3%
- Midterm 1 (Evolutionary Forces & Phylogenetics): Date 2026-10-19 | Exam | Weight: 15%
- Lab Report 3: Lake Lagunita Plankton Dynamics: Due 2026-10-28 | Homework | Weight: 3%
- Field Survey Interim Proposal: Due 2026-11-04 | Project | Weight: 5%
- Midterm 2 (Ecosystem Ecology & Trophic Cascades): Date 2026-11-16 | Exam | Weight: 15%
- Biodiversity Field Survey Final Report & Poster: Due 2026-12-01 | Paper | Weight: 10%
- Final Course Examination: Date 2026-12-11 | Exam | Weight: 25%`,
  },
  {
    id: 'phil20',
    name: 'PHIL 20: Ethics, Justice, and Technology',
    courseCode: 'PHIL 20',
    description: 'Humanities seminar with essays, discussion leadership, and take-home final paper.',
    text: `PHILOSOPHY 20: Ethics and Contemporary Society
Professor: Dr. Maya Henderson
Email: mhenderson@university.edu

Assessment Breakdown:
- Short Critical Essay 1 (Utilitarianism vs Deontology): 20%
- Midterm Analysis Paper (Distributive Justice): 25%
- Weekly Seminar Participation and Reading Reflections: 15%
- Final Term Paper (Topic of Choice with peer review): 40%

Key Deadlines:
- Weekly Reflection 1: 2026-10-07 (Quiz / 3%)
- Short Critical Essay 1: 2026-10-18 (Paper / 20%)
- Midterm Analysis Paper: 2026-11-06 (Paper / 25%)
- Final Paper Outline and Annotated Bibliography: 2026-11-18 (Homework / null)
- Final Term Paper: 2026-12-09 (Paper / 40%)`,
  },
];
