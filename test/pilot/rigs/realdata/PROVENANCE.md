# The real-machine records

Every plant in this project is a SIMULATION. What separates the plants in this directory
from the rest is the PROVENANCE OF THEIR PARAMETERS: each one's dynamics are identified
from a record measured on a real machine, and validated by FREE-RUN SIMULATION against a
cut of that record the fit never saw. That is exactly — and only — what the EMPS axis has
always been, and this directory exists partly to state it, because `CLAUDE.md` had been
describing EMPS as a "real machine" when what is real about it is where its constants came
from.

**A recorded trajectory is not a deployable plant.** Our method must APPLY a correction and
MEASURE the result, which no record can answer: it says what the machine did under ITS
input, not what it would have done under ours. So the route is the one EMPS already took —
identify, validate held-out, simulate, deploy — and the validation number is quoted beside
every control result these plants produce, because it is the number that prices them.

## The records

| File | Machine | Input | Output | n | Ts |
|---|---|---|---|---|---|
| `daisy-robot-arm.dat` | A flexible robot arm on an electrical motor | reaction torque of the structure on the ground | acceleration of the flexible arm | 1024 | 1 (normalised) |
| `daisy-heat-exchanger.dat` | A liquid-saturated steam heat exchanger | liquid flow rate | outlet liquid temperature | 4000 | 1 s |
| `cascaded-tanks.csv` | Two cascaded water tanks with a pump, overflow included | pump voltage | lower tank water level | 1024 est + 1024 val | 4 s |

`daisy-heat-exchanger.dat` carries a leading time column; the other two do not.
`cascaded-tanks.csv` carries its own estimation/validation split as separate columns, which
is the benchmark's, not ours.

## Sources and citation

- **DaISy** — the Database for the Identification of Systems, B. De Moor (ed.), Department
  of Electrical Engineering, ESAT/STADIUS, KU Leuven, Belgium. The flexible robot arm is
  DaISy set **96-009**; the heat exchanger is DaISy set **97-002** (S. Bittanti and
  L. Piroddi, "Nonlinear identification and control of a heat exchanger: a neural network
  approach"). Distributed for research use with attribution.
- **Cascaded Tanks** — the nonlinear system identification benchmark of M. Schoukens and
  J. P. Noël, "Three Benchmarks Addressing Open Challenges in Nonlinear System
  Identification", IFAC World Congress, 2017.

## How these files got here, and what it cost

The canonical hosts for all of this data are unreachable from this session: the egress
policy returns 403 for `nonlinearbenchmark.org`, `data.4tu.nl`, `zenodo.org`,
`huggingface.co`, `archive.ics.uci.edu`, `homes.esat.kuleuven.be` and
`fdm-fallback.uni-kl.de`. Only GitHub is reachable, so each record here was taken from a
public repository that vendors it, and the table above states what each file IS so that a
reader can check it against the benchmark's own published description rather than trusting
the path it arrived by.

**THE KUKA KR300 WAS HERE AND IS DELIBERATELY GONE** (Weigand et al., 2022; DOI TUK
10.26204/DATA/5). Every host serving it is blocked from this session, so the owner supplied
the files directly; they were read, identified and measured over four sections of
`docs/plan.md` (§55.8-§55.12), and then removed. Two facts decided it. Its records were
**222 MB — 89% of this repository** — against 272 kB for the three plants above. And it was
established, by four routes sharing no machinery, that **this record cannot support a plant
at all**: gravity is the torque, the inertial term sits below the fit's own residual on five
of six joints, and a forward simulation therefore reads R² at or below zero even in sample
with every quantity measured. Once that is settled the data buys nothing further and costs
every clone.

What replaces it is the WRITTEN RECORD rather than a smaller file, which is this
repository's standing practice for anything retired: §55.8-§55.12 carry the reader, the
sample-period findings, the one-step/free-run split, the replay control, the sourced
kinematics, the IDIM-LS identification and the decomposition that closed it. Re-obtaining
the data is a download; re-deriving why it does not work is four sections.

**So the real-arm gap is still open and is now stated without a candidate**: the flexible
robot arm here is one link, 1024 samples and a single sine sweep, where what is wanted is a
multi-axis machine whose excitation moves it at a real fraction of its rated acceleration.
The KUKA was not that either — that is the finding, not an excuse.
