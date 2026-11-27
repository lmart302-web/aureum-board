
import { db } from "./firebase.js";

import {
    collection,
    doc,
    getDoc,
    setDoc,
    onSnapshot,
    runTransaction
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";


/* ==========================================
   AUREUM BOARD
   조직도 기본 데이터
========================================== */

const organizationData = [
    { name: "1반", teams: ["평화팀", "사랑팀"] },
    { name: "2반", teams: ["호!팀", "우주팀"] },
    { name: "3반", teams: ["동광팀", "지구팀", "나비팀"] },
    { name: "4반", teams: ["코스모스팀", "해바라기팀", "리앙팀"] }
];

const organizationContainer = document.getElementById(
    "organization-container"
);

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

// 휠체어 이용 구성원
const wheelchairData = {
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

// 구성원 역할: provider / user
// 기존 구성원은 모두 이용인으로 처리
const roleData = {
    "평화팀": {},
    "사랑팀": {},
    "호!팀": {},
    "우주팀": {},
    "동광팀": {},
    "지구팀": {},
    "나비팀": {},
    "코스모스팀": {},
    "해바라기팀": {},
    "리앙팀": {}
};


/* ==========================================
   공통 설정 및 데이터
========================================== */

const memberDocument = doc(db, "settings", "members");
const organizationDocument = doc(db, "settings", "organization");
const vacationCollection = collection(db, "vacations");

const vacationData = {};
const vacationReplacementData = {};

let calendarDate = new Date();
let selectedVacationDate = null;


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

function getMemberRole(team, member) {
    return roleData[team]?.[member] || "user";
}

function getRoleIcon(role) {
    return role === "provider" ? "👨‍💼" : "🧑";
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
                    teams: memberData,
                    wheelchair: wheelchairData,
                    roles: roleData
                });
            }
        });
    } catch (error) {
        console.error("구성원 초기화 오류:", error);
    }
}


// 구성원 추가
async function addMemberSafely(team, name, role, isWheelchair) {
    return await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(memberDocument);

        const data = snapshot.exists() ? snapshot.data() : {};

        const teams = { ...(data.teams || {}) };
        const wheelchair = { ...(data.wheelchair || {}) };
        const roles = { ...(data.roles || {}) };

        const currentMembers = teams[team] || [];
        const currentWheelchair = wheelchair[team] || [];
        const currentRoles = { ...(roles[team] || {}) };

        if (currentMembers.includes(name)) {
            return false;
        }

        teams[team] = [...currentMembers, name];

        wheelchair[team] = isWheelchair
            ? [...currentWheelchair, name]
            : currentWheelchair;

        currentRoles[name] = role;
        roles[team] = currentRoles;

        transaction.set(memberDocument, {
            teams,
            wheelchair,
            roles
        });

        return true;
    });
}


// 구성원 삭제
async function deleteMemberSafely(team, name) {
    return await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(memberDocument);

        if (!snapshot.exists()) return false;

        const data = snapshot.data();

        const teams = { ...(data.teams || {}) };
        const wheelchair = { ...(data.wheelchair || {}) };
        const roles = { ...(data.roles || {}) };

        const currentMembers = teams[team] || [];

        if (!currentMembers.includes(name)) return false;

        teams[team] = currentMembers.filter(member => member !== name);

        wheelchair[team] = (wheelchair[team] || [])
            .filter(member => member !== name);

        const currentRoles = { ...(roles[team] || {}) };
        delete currentRoles[name];
        roles[team] = currentRoles;

        transaction.set(memberDocument, {
            teams,
            wheelchair,
            roles
        });

        return true;
    });
}


// 구성원 팀 이동
async function moveMemberSafely(fromTeam, targetTeam, name) {
    return await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(memberDocument);

        if (!snapshot.exists()) return false;

        const data = snapshot.data();

        const teams = { ...(data.teams || {}) };
        const wheelchair = { ...(data.wheelchair || {}) };
        const roles = { ...(data.roles || {}) };

        const sourceMembers = teams[fromTeam] || [];
        const targetMembers = teams[targetTeam] || [];

        if (!sourceMembers.includes(name) || targetMembers.includes(name)) {
            return false;
        }

        const isWheelchair = (wheelchair[fromTeam] || []).includes(name);
        const memberRole = roles[fromTeam]?.[name] || "user";

        teams[fromTeam] = sourceMembers.filter(member => member !== name);
        teams[targetTeam] = [...targetMembers, name];

        wheelchair[fromTeam] = (wheelchair[fromTeam] || [])
            .filter(member => member !== name);

        wheelchair[targetTeam] = wheelchair[targetTeam] || [];

        if (isWheelchair) {
            wheelchair[targetTeam].push(name);
        }

        roles[fromTeam] = { ...(roles[fromTeam] || {}) };
        roles[targetTeam] = { ...(roles[targetTeam] || {}) };

        delete roles[fromTeam][name];
        roles[targetTeam][name] = memberRole;

        transaction.set(memberDocument, {
            teams,
            wheelchair,
            roles
        });

        return true;
    });
}


/* ==========================================
   FIREBASE 휴가 데이터 관리
========================================== */

// 휴가 등록 및 대체인력 진행 여부 저장
async function setVacationSafely(date, team, isReplacement) {
    const vacationDocument = doc(db, "vacations", date);

    return await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(vacationDocument);

        const data = snapshot.exists() ? snapshot.data() : {};

        const teams = [...(data.teams || [])];
        const replacementTeams = [...(data.replacementTeams || [])];

        if (!teams.includes(team)) {
            teams.push(team);
        }

        const wasReplacement = replacementTeams.includes(team);

        if (isReplacement && !wasReplacement) {
            replacementTeams.push(team);
        } else if (!isReplacement && wasReplacement) {
            const index = replacementTeams.indexOf(team);
            replacementTeams.splice(index, 1);
        }

        transaction.set(vacationDocument, {
            teams,
            replacementTeams
        });

        return true;
    });
}


// 휴가 삭제
async function deleteVacationSafely(date, team) {
    const vacationDocument = doc(db, "vacations", date);

    return await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(vacationDocument);

        if (!snapshot.exists()) return false;

        const data = snapshot.data();

        const teams = (data.teams || [])
            .filter(item => item !== team);

        const replacementTeams = (data.replacementTeams || [])
            .filter(item => item !== team);

        if (teams.length === 0) {
            transaction.delete(vacationDocument);
        } else {
            transaction.set(vacationDocument, {
                teams,
                replacementTeams
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

                wheelchairData[team] = Array.isArray(data.wheelchair?.[team])
                    ? data.wheelchair[team]
                    : [];

                roleData[team] = {};

                memberData[team].forEach(member => {
                    roleData[team][member] =
                        data.roles?.[team]?.[member] || "user";
                });
            });

            renderOrganization();

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
            Object.keys(vacationData).forEach(date => {
                delete vacationData[date];
            });

            Object.keys(vacationReplacementData).forEach(date => {
                delete vacationReplacementData[date];
            });

            snapshot.forEach(documentSnapshot => {
                const data = documentSnapshot.data();

                vacationData[documentSnapshot.id] =
                    Array.isArray(data.teams) ? data.teams : [];

                vacationReplacementData[documentSnapshot.id] =
                    Array.isArray(data.replacementTeams)
                        ? data.replacementTeams
                        : [];
            });

            renderCalendar();
            renderVacationDetail();
            renderOrganization();
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

    const today = new Date();

    const todayKey =
        `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const todayVacations = vacationData[todayKey] || [];
const todayReplacements = vacationReplacementData[todayKey] || [];
    const totalTeams = organizationData.reduce(
        (total, group) => total + group.teams.length, 0
    );

    let providerCount = 0;
    let userCount = 0;
    let wheelchairCount = 0;

    Object.keys(memberData).forEach(team => {
        memberData[team].forEach(member => {
            if (getMemberRole(team, member) === "provider") {
                providerCount++;
            } else {
                userCount++;
            }
        });

        wheelchairCount += wheelchairData[team].length;
    });

    // 조직도 제목 옆 인원 현황
    const organizationTitle = document.querySelector(
        "#organization-page .section-header h2"
    );

    if (organizationTitle) {
        let summary = document.getElementById("organization-summary");

        if (!summary) {
            summary = document.createElement("span");
            summary.id = "organization-summary";
            organizationTitle.appendChild(summary);
        }

        summary.textContent =
            ` ${totalTeams}팀 · 제공인력 ${providerCount}명 · 이용인 ${userCount}명 (휠체어 ${wheelchairCount}대)`;
    }

    organizationContainer.innerHTML = organizationData.map(group => `
        <div class="class-card">

            <div class="class-header">
                <h3>${escapeHTML(group.name)}</h3>
            </div>

            <div class="team-list">

                ${group.teams.map(team => {
                    const isVacation = todayVacations.includes(team);
const isReplacement = todayReplacements.includes(team);

                    return `
                        <div class="team-card">

                            <div class="team-title-row">
                                <h4>${escapeHTML(team)}</h4>

                                <span class="team-status ${
    isReplacement ? "substitute" : isVacation ? "vacation" : "working"
}">
    ${
        isReplacement
            ? "대체인력"
            : isVacation
                ? "휴가"
                : "정상근무"
    }
</span>
                            </div>

                            <div class="team-members">

                                ${(memberData[team] || []).length > 0
                                    ? memberData[team].map(member => {
                                        const role = getMemberRole(team, member);
                                        const isWheelchair =
                                            wheelchairData[team]?.includes(member);

                                        return `
                                            <div class="team-member-row">
                                                <span class="team-member-name">
                                                    <span class="member-role-icon" title="${role === "provider" ? "제공인력" : "이용인"}">
                                                        ${getRoleIcon(role)}
                                                    </span>
                                                    ${escapeHTML(member)}
                                                    ${isWheelchair
                                                        ? `<span class="wheelchair-icon" title="휠체어 이용">♿</span>`
                                                        : ""
                                                    }
                                                </span>
                                            </div>
                                        `;
                                    }).join("")
                                    : `<div class="empty-member">등록된 구성원 없음</div>`
                                }

                            </div>
                        </div>
                    `;
                }).join("")}

            </div>
        </div>
    `).join("");
}


/* ==========================================
   메뉴 이동
========================================== */

const navButtons = document.querySelectorAll(".nav-button");
const pages = document.querySelectorAll(".page");

document.getElementById("open-members-button")
    ?.addEventListener("click", () => {

        navButtons.forEach(nav => nav.classList.remove("active"));
        pages.forEach(page => page.classList.remove("active"));

        document.getElementById("members-page")
            ?.classList.add("active");

        renderMembersPage();
    });


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

            <button id="back-organization-button">
                조직도로 돌아가기
            </button>

        </div>

        <div class="members-management-list">

            ${organizationData.map(group => `
                <div class="management-class-card">

                    <h3>${escapeHTML(group.name)}</h3>

                    ${group.teams.map(team => `
                        <div class="management-team">

                            <div class="management-team-header">
                                <strong>${escapeHTML(team)}</strong>
                                <span>${memberData[team].length}명</span>
                            </div>

                            <div class="management-member-list">

                                ${memberData[team].map((member, index) => {
                                    const role = getMemberRole(team, member);
                                    const isWheelchair =
                                        wheelchairData[team]?.includes(member);

                                    return `
                                        <div class="management-member">

                                            <span class="management-member-name">
                                                ${getRoleIcon(role)}
                                                ${escapeHTML(member)}
                                                ${isWheelchair
                                                    ? `<span class="wheelchair-icon" title="휠체어 이용">♿</span>`
                                                    : ""
                                                }
                                                <small>
                                                    ${role === "provider" ? "제공인력" : "이용인"}
                                                </small>
                                            </span>

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
                                    `;
                                }).join("")}

                            </div>

                            <div class="management-add-area">

                                <input
                                    type="text"
                                    class="management-name-input"
                                    data-team="${escapeHTML(team)}"
                                    placeholder="이름 입력"
                                >

                                <select class="management-role-select">
                                    <option value="user">이용인</option>
                                    <option value="provider">제공인력</option>
                                </select>

                                <label class="wheelchair-option">
                                    <input type="checkbox" class="wheelchair-input">
                                    휠체어
                                </label>

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


    // 조직도로 돌아가기
    document.getElementById("back-organization-button")
        ?.addEventListener("click", () => {

            pages.forEach(page => page.classList.remove("active"));
            navButtons.forEach(nav => nav.classList.remove("active"));

            document.getElementById("organization-page")
                ?.classList.add("active");

            document.querySelector('[data-page="organization"]')
                ?.classList.add("active");
        });


    // 구성원 추가
    page.querySelectorAll(".management-add-button").forEach(button => {
        button.addEventListener("click", async () => {

            const team = button.dataset.team;

            const area = button.parentElement;

            const input = area.querySelector(".management-name-input");
            const roleSelect = area.querySelector(".management-role-select");
            const wheelchairInput = area.querySelector(".wheelchair-input");

            const name = input.value.trim();
            const role = roleSelect.value;
            const isWheelchair = role === "user" && wheelchairInput.checked;

            if (!name) {
                alert("이름을 입력해주세요.");
                return;
            }

            try {
                const added = await addMemberSafely(
                    team,
                    name,
                    role,
                    isWheelchair
                );

                if (!added) {
                    alert("이미 해당 팀에 등록된 구성원입니다.");
                    return;
                }

                input.value = "";
                wheelchairInput.checked = false;
                roleSelect.value = "user";

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

    for (let i = 0; i < firstDay; i++) {
        calendarHTML += `
            <div class="calendar-day empty"></div>
        `;
    }

    for (let day = 1; day <= lastDate; day++) {
        const dateKey =
            `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

        const isToday =
            year === today.getFullYear() &&
            month === today.getMonth() &&
            day === today.getDate();

        const isSelected = selectedVacationDate === dateKey;

        const teams = vacationData[dateKey] || [];
        const replacementTeams = vacationReplacementData[dateKey] || [];

        calendarHTML += `
            <div class="calendar-day
                ${isToday ? "today" : ""}
                ${isSelected ? "selected-day" : ""}"
                data-date="${dateKey}">

                <div class="day-number">${day}</div>

                <div class="calendar-vacation-list">

                    ${teams.map(team => `
    <div class="calendar-vacation-item">
    <span class="vacation-team-name">${escapeHTML(team)}</span>
    ${replacementTeams.includes(team)
        ? `<span class="replacement-label">(대체인력)</span>`
        : ""
    }
</div>
`).join("")}

                </div>

            </div>
        `;
    }

    daysContainer.innerHTML = calendarHTML;

    daysContainer.querySelectorAll(".calendar-day:not(.empty)")
        .forEach(dayElement => {

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

document.getElementById("prev-month")
    ?.addEventListener("click", () => {
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        renderCalendar();
    });

document.getElementById("next-month")
    ?.addEventListener("click", () => {
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
    const replacementTeams =
        vacationReplacementData[selectedVacationDate] || [];

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

                <label class="replacement-option">
                    <input type="checkbox" id="replacement-checkbox">
                    대체인력 진행
                </label>

                <button id="add-vacation-button">
                    휴가 등록
                </button>

            </div>

            <div id="vacation-team-list">

                ${teams.length > 0
                    ? teams.map(team => `
                        <div class="vacation-team-item">

                            <span>
                                ${escapeHTML(team)}
                                ${replacementTeams.includes(team)
                                    ? `<small class="replacement-label">대체인력 진행</small>`
                                    : ""
                                }
                            </span>

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


    // 휴가 등록 및 대체인력 진행 여부 저장
    document.getElementById("add-vacation-button")
        ?.addEventListener("click", async () => {

            const select = document.getElementById("vacation-team-select");
            const replacementCheckbox =
                document.getElementById("replacement-checkbox");

            const team = select.value;
            const date = selectedVacationDate;
            const isReplacement = replacementCheckbox.checked;

            if (!team) {
                alert("팀을 선택해주세요.");
                return;
            }

            try {
                await setVacationSafely(date, team, isReplacement);

                renderVacationDetail();

            } catch (error) {
                console.error("휴가 등록 오류:", error);
                alert("휴가 등록에 실패했습니다.");
            }
        });


    // 휴가 삭제
    container.querySelectorAll(".delete-vacation-button")
        .forEach(button => {

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

renderOrganization();
renderCalendar();
startFirebaseSync();
