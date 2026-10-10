# Hand entered data

One file in this project is not machine generated.

`minurso_renewals.csv` holds the Security Council votes renewing the MINURSO mandate
from 2016 to 2025. The General Assembly roll call file contains no vote naming
MINURSO, because the mission is a Security Council creation and the Fifth Committee
funds it without a recorded vote, so this layer comes from outside the main pipeline.

Each row was read from the resolution page at https://unscr.com/, an unofficial
compilation of Security Council resolutions that is not affiliated with the United
Nations, on 1 September 2026. The columns carry the tally only. Which member abstained
is not recorded here, because the source publishes the tally and the Council roster
without the mapping between them, and that mapping needs the meeting record (S/PV).

Renewals before 2016 are not included. The 2016 renewal, S/RES/2285, is the only vote
in the set to draw votes against, and S/RES/2351 in 2017 is the last unanimous one.
