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

**One intended plant is therefore MISSING and it is the one that was asked for**: the
KUKA KR300 R2500 ultra SE Industrial Robot identification benchmark (Weigand et al., 2022;
DOI TUK 10.26204/DATA/5). It is served from `fdm-fallback.uni-kl.de` alone, as a 12.7 MB
`.rar`; that host is blocked, no GitHub repository mirrors the archive or any extract of
it, and the one repository that mirrors the rest of this collection keeps its copies in Git
LFS, which this session's anonymous git lane does not serve. The flexible robot arm here is
the available real-arm datum, not a substitute of equal value: it is one link, 1024
samples and a single sine sweep, against six axes and 40,000 samples of full robot
movement. That gap is stated rather than papered over.
