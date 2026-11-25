
import { db } from "./firebase.js";

import {
    collection,
    doc,
    getDoc,
    setDoc,
    deleteDoc,
    onSnapshot,
    runTransaction
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


/* ==========================================
   AUREUM BOARD
   조직도 기본 데이터
========================================== */

// 반별 팀 구성
const organizationData = [
    {
        name: "1반",
        teams: ["평화팀", "사랑팀"]
    },
    {
        name: "2반",
        teams: ["호!팀", "우주팀"]
    },
    {
        name: "3반",
        teams: ["동광팀", "지구팀", "나비팀"]
    },
    {
        name: "4반",
        teams: ["코스모스팀", "해바라기팀", "리앙팀"]
    }
];

// 조직도 표시 영역
const organizationContainer = document.getElementById(
    "organization-container"
);

// 팀별 구성원 데이터
const memberData = {
    "평화팀": [],
    "사랑팀": [],
    "호!팀": [],
    "우주팀": [],
    "동광팀": [],
    "지구팀": [],
    "나비팀": [],
    "코스모스팀": [],
    "해바라기팀": [],
    "리앙팀": []
};

// 선택된 팀
let selectedTeam = null;


/* ==========================================
   공통 설정 및 데이터
========================================== */

const memberDocument = doc(db, "settings", "members");
const organizationDocument = doc(db, "settings", "organization");
const vacationCollection = collection(db, "vacations");

// 날짜별 휴가 데이터
const vacationData = {};

// 현재 표시할 달
let calendarDate = new Date();

// 선택한 날짜
let selectedVacationDate = null;

// HTML 특수문자 처리
function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        };

        return entities[character];
    });
}


/* ==========================================
   FIREBASE 구성원 데이터 관리
========================================== */

// 최초 구성원 데이터 생성
async function saveMembers() {
    try {
        await runTransaction(db, async transaction => {
            const snapshot = await transaction.get(memberDocument);

            if (!snapshot.exists()) {
                transaction.set(memberDocument, {
                    teams: memberData
                });
            }
        });
    } catch (error) {
        console.error("구성원 초기화 오류:", error);
    }
}


// 구성원 추가
async function addMemberSafely(team, name) {
    return await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(memberDocument);

        const teams = snapshot.exists()
            ? snapshot.data().teams || {}
            : {};

        const currentMembers = teams[team] || [];

        if (currentMembers.includes(name)) {
            return false;
        }

        teams[team] = [...currentMembers, name];

        transaction.set(memberDocument, { teams });

        return true;
    });
}


// 구성원 삭제
async function deleteMemberSafely(team, name) {
    return await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(memberDocument);

        if (!snapshot.exists()) {
            return false;
        }

        const teams = snapshot.data().teams || {};
        const currentMembers = teams[team] || [];
        const index = currentMembers.indexOf(name);

        if (index === -1) {
            return false;
        }

        teams[team] = currentMembers.filter((member, i) => i !== index);

        transaction.set(memberDocument, { teams });

        return true;
    });
}


// 구성원 팀 이동
async function moveMemberSafely(fromTeam, targetTeam, name) {
    return await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(memberDocument);

        if (!snapshot.exists()) {
            return false;
        }

        const teams = snapshot.data().teams || {};

        const sourceMembers = teams[fromTeam] || [];
        const targetMembers = teams[targetTeam] || [];

        const index = sourceMembers.indexOf(name);

        if (index === -1 || targetMembers.includes(name)) {
            return false;
        }

        teams[fromTeam] = sourceMembers.filter((member, i) => i !== index);
        teams[targetTeam] = [...targetMembers, name];

        transaction.set(memberDocument, { teams });

        return true;
    });
}


/* ==========================================
   FIREBASE 휴가 데이터 관리
========================================== */

// 휴가 등록
async function addVacationSafely(date, team) {
    const vacationDocument = doc(db, "vacations", date);

    return await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(vacationDocument);

        const teams = snapshot.exists()
            ? snapshot.data().teams || []
            : [];

        if (teams.includes(team)) {
            return false;
        }

        transaction.set(vacationDocument, {
            teams: [...teams, team]
        });

        return true;
    });
}


// 휴가 삭제
async function deleteVacationSafely(date, team) {
    const vacationDocument = doc(db, "vacations", date);

    return await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(vacationDocument);

        if (!snapshot.exists()) {
            return false;
        }

        const teams = snapshot.data().teams || [];

        if (!teams.includes(team)) {
            return false;
        }

        const updatedTeams = teams.filter(item => item !== team);

        if (updatedTeams.length === 0) {
            transaction.delete(vacationDocument);
        } else {
            transaction.set(vacationDocument, {
                teams: updatedTeams
            });
        }

        return true;
    });
}


/* ==========================================
   FIREBASE 실시간 데이터 연결
========================================== */

function startFirebaseSync() {

    // 조직도 기본 정보 초기화
    getDoc(organizationDocument)
        .then(snapshot => {
            if (!snapshot.exists()) {
                return setDoc(organizationDocument, {
                    classes: organizationData
                });
            }
        })
        .catch(error => {
            console.error("조직도 연결 오류:", error);
        });


    // 구성원 실시간 동기화
    onSnapshot(
        memberDocument,

        snapshot => {

            if (!snapshot.exists()) {
                saveMembers();
                return;
            }

            const data = snapshot.data();

            Object.keys(memberData).forEach(team => {
                memberData[team] = Array.isArray(data.teams?.[team])
                    ? data.teams[team]
                    : [];
            });

            renderOrganization();
            renderTeamDetail();

            const membersPage = document.getElementById("members-page");

            if (membersPage?.classList.contains("active")) {
                renderMembersPage();
            }
        },

        error => {
            console.error("구성원 실시간 연결 오류:", error);
        }
    );


    // 휴가 실시간 동기화
    onSnapshot(
        vacationCollection,

        snapshot => {

            // 기존 데이터 초기화
            Object.keys(vacationData).forEach(date => {
                delete vacationData[date];
            });

            // Firestore 데이터 반영
            snapshot.forEach(documentSnapshot => {
                const data = documentSnapshot.data();

                vacationData[documentSnapshot.id] =
                    Array.isArray(data.teams) ? data.teams : [];
            });

            renderCalendar();
            renderVacationDetail();
        },

        error => {
            console.error("휴가 실시간 연결 오류:", error);
        }
    );
}


/* ==========================================
   조직도 화면
========================================== */

function renderOrganization() {

    if (!organizationContainer) return;

    organizationContainer.innerHTML = organizationData.map(group => `
        <div class="class-card">

            <div class="class-header">
                <h3>${group.name}</h3>
            </div>

            <div class="team-list">

                ${group.teams.map(team => `
                    <div class="team-card"
                         data-team="${escapeHTML(team)}"
                         style="${selectedTeam === team
                            ? 'border-color: var(--green); background: var(--green-light);'
                            : ''}">

                        <h4>${escapeHTML(team)}</h4>
                        <p>구성원 ${memberData[team].length}명</p>
                        <span class="team-status">정상 근무</span>

                    </div>
                `).join("")}

            </div>

        </div>
    `).join("");


    // 팀 클릭 이벤트
    document.querySelectorAll(".team-card").forEach(card => {

        card.addEventListener("click", () => {

            selectedTeam = card.dataset.team;

            renderOrganization();
            renderTeamDetail();

        });

    });
}


/* ==========================================
   팀 상세 정보
========================================== */

function renderTeamDetail() {

    const container = document.getElementById("team-detail-container");

    if (!container) return;

    if (!selectedTeam) {
        container.innerHTML = "";
        return;
    }

    const members = memberData[selectedTeam];

    container.innerHTML = `
        <div class="team-detail-card">

            <h3>${escapeHTML(selectedTeam)}</h3>

            <div class="member-list">

                ${members.length > 0
                    ? members.map(member => `
                        <div class="member-item">
                            <span>${escapeHTML(member)}</span>
                        </div>
                    `).join("")
                    : `<p>등록된 구성원이 없습니다.</p>`
                }

            </div>

        </div>
    `;
}


/* ==========================================
   메뉴 이동
========================================== */

const navButtons = document.querySelectorAll(".nav-button");
const pages = document.querySelectorAll(".page");

navButtons.forEach(button => {

    button.addEventListener("click", () => {

        const targetPage = button.dataset.page;

        navButtons.forEach(nav => nav.classList.remove("active"));
        pages.forEach(page => page.classList.remove("active"));

        button.classList.add("active");

        document.getElementById(`${targetPage}-page`)
            ?.classList.add("active");

        if (targetPage === "members") {
            renderMembersPage();
        }

    });

});


/* ==========================================
   구성원 관리 화면
========================================== */

function renderMembersPage() {

    const page = document.getElementById("members-page");

    if (!page) return;

    page.innerHTML = `
        <div class="section-header">
            <div>
                <h2>구성원 관리</h2>
                <p>각 팀의 구성원을 추가하고 이동 및 삭제할 수 있습니다.</p>
            </div>
        </div>

        <div class="members-management-list">

            ${organizationData.map(group => `
                <div class="management-class-card">

                    <h3>${group.name}</h3>

                    ${group.teams.map(team => `
                        <div class="management-team">

                            <div class="management-team-header">
                                <strong>${escapeHTML(team)}</strong>
                                <span>${memberData[team].length}명</span>
                            </div>

                            <div class="management-member-list">

                                ${memberData[team].map((member, index) => `
                                    <div class="management-member">

                                        <span>${escapeHTML(member)}</span>

                                        <div class="member-actions">

                                            <button
                                                class="move-management-member"
                                                data-team="${escapeHTML(team)}"
                                                data-index="${index}">
                                                이동
                                            </button>

                                            <button
                                                class="delete-management-member"
                                                data-team="${escapeHTML(team)}"
                                                data-index="${index}">
                                                삭제
                                            </button>

                                        </div>

                                    </div>
                                `).join("")}

                            </div>

                            <div class="management-add-area">

                                <input
                                    type="text"
                                    class="management-name-input"
                                    data-team="${escapeHTML(team)}"
                                    placeholder="이름 입력"
                                >

                                <button
                                    class="management-add-button"
                                    data-team="${escapeHTML(team)}">
                                    추가
                                </button>

                            </div>

                        </div>
                    `).join("")}

                </div>
            `).join("")}

        </div>
    `;


    // 구성원 추가
    page.querySelectorAll(".management-add-button").forEach(button => {

        button.addEventListener("click", async () => {

            const team = button.dataset.team;

            const input = button.parentElement.querySelector(
                ".management-name-input"
            );

            const name = input.value.trim();

            if (!name) {
                alert("이름을 입력해주세요.");
                return;
            }

            try {
                const added = await addMemberSafely(team, name);

                if (!added) {
                    alert("이미 해당 팀에 등록된 구성원입니다.");
                    return;
                }

                input.value = "";

            } catch (error) {
                console.error("구성원 추가 오류:", error);
                alert("구성원 추가에 실패했습니다.");
            }

        });

    });


    // 구성원 삭제
    page.querySelectorAll(".delete-management-member").forEach(button => {

        button.addEventListener("click", async () => {

            const team = button.dataset.team;
            const index = Number(button.dataset.index);
            const member = memberData[team][index];

            if (!member) return;

            if (!confirm(`${member}님을 삭제할까요?`)) {
                return;
            }

            try {
                const deleted = await deleteMemberSafely(team, member);

                if (!deleted) {
                    alert("구성원 정보가 변경되어 삭제하지 못했습니다. 화면을 확인해주세요.");
                }

            } catch (error) {
                console.error("구성원 삭제 오류:", error);
                alert("구성원 삭제에 실패했습니다.");
            }

        });

    });


    // 구성원 팀 이동
    page.querySelectorAll(".move-management-member").forEach(button => {

        button.addEventListener("click", async () => {

            const fromTeam = button.dataset.team;
            const index = Number(button.dataset.index);
            const member = memberData[fromTeam][index];

            if (!member) return;

            const targetTeam = prompt(
                `${member}님을 이동할 팀 이름을 입력하세요.\n\n` +
                Object.keys(memberData).join(", ")
            );

            if (!targetTeam) return;

            if (!memberData[targetTeam]) {
                alert("존재하지 않는 팀입니다.");
                return;
            }

            if (targetTeam === fromTeam) {
                alert("현재 소속된 팀입니다.");
                return;
            }

            try {
                const moved = await moveMemberSafely(
                    fromTeam,
                    targetTeam,
                    member
                );

                if (!moved) {
                    alert("구성원 정보가 변경되었거나 대상 팀에 이미 등록되어 있습니다. 화면을 확인해주세요.");
                }

            } catch (error) {
                console.error("구성원 이동 오류:", error);
                alert("구성원 이동에 실패했습니다.");
            }

        });

    });

}


/* ==========================================
   휴가 달력
========================================== */

function renderCalendar() {

    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    const title = document.getElementById("calendar-title");
    const daysContainer = document.getElementById("calendar-days");

    if (!title || !daysContainer) return;

    title.textContent = `${year}년 ${month + 1}월`;

    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    const today = new Date();

    let calendarHTML = "";


    // 첫 주 빈칸
    for (let i = 0; i < firstDay; i++) {
        calendarHTML += `
            <div class="calendar-day empty"></div>
        `;
    }


    // 날짜 출력
    for (let day = 1; day <= lastDate; day++) {

        const dateKey =
            `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

        const isToday =
            year === today.getFullYear() &&
            month === today.getMonth() &&
            day === today.getDate();

        const isSelected = selectedVacationDate === dateKey;

        const teams = vacationData[dateKey] || [];

        calendarHTML += `
            <div class="calendar-day
                ${isToday ? "today" : ""}
                ${isSelected ? "selected-day" : ""}"
                data-date="${dateKey}">

                <div class="day-number">${day}</div>

                <div class="calendar-vacation-list">

                    ${teams.map(team => `
                        <div class="calendar-vacation-item">
                            ${escapeHTML(team)}
                        </div>
                    `).join("")}

                </div>

            </div>
        `;
    }

    daysContainer.innerHTML = calendarHTML;


    // 날짜 클릭
    daysContainer.querySelectorAll(".calendar-day:not(.empty)").forEach(dayElement => {

        dayElement.addEventListener("click", () => {

            selectedVacationDate = dayElement.dataset.date;

            renderCalendar();
            renderVacationDetail();

        });

    });

}


/* ==========================================
   달력 월 이동
========================================== */

// 이전 달
document.getElementById("prev-month")?.addEventListener("click", () => {

    calendarDate.setMonth(calendarDate.getMonth() - 1);

    renderCalendar();

});


// 다음 달
document.getElementById("next-month")?.addEventListener("click", () => {

    calendarDate.setMonth(calendarDate.getMonth() + 1);

    renderCalendar();

});


/* ==========================================
   날짜별 휴가 등록 및 관리
========================================== */

function renderVacationDetail() {

    const container = document.getElementById("vacation-detail-container");

    if (!container) return;

    if (!selectedVacationDate) {
        container.innerHTML = "";
        return;
    }

    const teams = vacationData[selectedVacationDate] || [];

    container.innerHTML = `
        <div class="vacation-detail-card">

            <h3>${selectedVacationDate} 휴가 일정</h3>

            <div class="vacation-add-area">

                <select id="vacation-team-select">

                    <option value="">팀 선택</option>

                    ${Object.keys(memberData).map(team => `
                        <option value="${escapeHTML(team)}">
                            ${escapeHTML(team)}
                        </option>
                    `).join("")}

                </select>

                <button id="add-vacation-button">
                    휴가 등록
                </button>

            </div>


            <div id="vacation-team-list">

                ${teams.length > 0
                    ? teams.map(team => `
                        <div class="vacation-team-item">

                            <span>${escapeHTML(team)}</span>

                            <button
                                class="delete-vacation-button"
                                data-team="${escapeHTML(team)}">
                                삭제
                            </button>

                        </div>
                    `).join("")
                    : `<p class="no-vacation">등록된 휴가 일정이 없습니다.</p>`
                }

            </div>

        </div>
    `;


    // 휴가 등록
    document.getElementById("add-vacation-button")
        ?.addEventListener("click", async () => {

            const select = document.getElementById("vacation-team-select");
            const team = select.value;

            // 선택된 날짜를 별도로 저장
            const date = selectedVacationDate;

            if (!team) {
                alert("팀을 선택해주세요.");
                return;
            }

            try {
                const added = await addVacationSafely(date, team);

                if (!added) {
                    alert("이미 등록된 팀입니다.");
                }

            } catch (error) {
                console.error("휴가 등록 오류:", error);
                alert("휴가 등록에 실패했습니다.");
            }

        });


    // 휴가 삭제
    container.querySelectorAll(".delete-vacation-button").forEach(button => {

        button.addEventListener("click", async () => {

            const team = button.dataset.team;
            const date = selectedVacationDate;

            if (!confirm(`${date} ${team} 휴가를 삭제할까요?`)) {
                return;
            }

            try {
                const deleted = await deleteVacationSafely(date, team);

                if (!deleted) {
                    alert("휴가 정보가 변경되었습니다. 화면을 확인해주세요.");
                }

            } catch (error) {
                console.error("휴가 삭제 오류:", error);
                alert("휴가 삭제에 실패했습니다.");
            }

        });

    });

}


/* ==========================================
   최초 실행
========================================== */

// 조직도 출력
renderOrganization();

// 달력 출력
renderCalendar();

// Firebase 실시간 동기화 시작
startFirebaseSync();
