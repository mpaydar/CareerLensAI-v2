"use client";

import { useMemo, useState } from "react";

type Faculty = {
  firstName: string;
  lastName: string;
  title: string;
  email: string;
  googleScholar: string;
  school: string;
  department: string;
  researchInterest: string;
  matchingPercentage: number;
};

const FACULTY_SAMPLE: Faculty[] = [
  {
    firstName: "Maya",
    lastName: "Thompson",
    title: "Associate Professor",
    email: "maya.thompson@northbridge.edu",
    googleScholar: "https://scholar.google.com/citations?user=maya-thompson",
    school: "Northbridge University",
    department: "Computer Science",
    researchInterest: "Human-centered AI, trustworthy machine learning",
    matchingPercentage: 93,
  },
  {
    firstName: "Daniel",
    lastName: "Kim",
    title: "Professor",
    email: "d.kim@northbridge.edu",
    googleScholar: "https://scholar.google.com/citations?user=daniel-kim",
    school: "Northbridge University",
    department: "Electrical Engineering",
    researchInterest: "Robotics, autonomous systems, reinforcement learning",
    matchingPercentage: 88,
  },
  {
    firstName: "Amina",
    lastName: "Rahman",
    title: "Assistant Professor",
    email: "arahman@westfield.edu",
    googleScholar: "https://scholar.google.com/citations?user=amina-rahman",
    school: "Westfield Institute of Technology",
    department: "Data Science",
    researchInterest: "Applied NLP, information retrieval, LLM evaluation",
    matchingPercentage: 91,
  },
  {
    firstName: "Leo",
    lastName: "Garcia",
    title: "Professor",
    email: "leo.garcia@westfield.edu",
    googleScholar: "https://scholar.google.com/citations?user=leo-garcia",
    school: "Westfield Institute of Technology",
    department: "Computer Science",
    researchInterest: "Distributed systems, cloud computing, data platforms",
    matchingPercentage: 84,
  },
];

export function AcademicOpportunitiesDashboard() {
  const [schoolQuery, setSchoolQuery] = useState("");
  const [selectedDepartment, setSelectedDepartment] = useState("all");

  const departments = useMemo(() => {
    return Array.from(new Set(FACULTY_SAMPLE.map((item) => item.department)));
  }, []);

  const filteredFaculty = useMemo(() => {
    return FACULTY_SAMPLE.filter((item) => {
      const schoolMatch = item.school
        .toLowerCase()
        .includes(schoolQuery.trim().toLowerCase());
      const departmentMatch =
        selectedDepartment === "all" || item.department === selectedDepartment;
      return schoolMatch && departmentMatch;
    }).sort((a, b) => b.matchingPercentage - a.matchingPercentage);
  }, [schoolQuery, selectedDepartment]);

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
      <h2 className="text-sm uppercase tracking-wide text-zinc-400">
        Academic Opportunities
      </h2>
      <p className="mt-2 text-sm text-zinc-500">
        Search by school and filter by department to discover faculty matches.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium text-zinc-400">Search school</span>
          <input
            type="text"
            value={schoolQuery}
            onChange={(event) => setSchoolQuery(event.target.value)}
            placeholder="e.g. Northbridge University"
            className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-zinc-400">Department</span>
          <select
            value={selectedDepartment}
            onChange={(event) => setSelectedDepartment(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
          >
            <option value="all">All departments</option>
            {departments.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 space-y-3">
        {filteredFaculty.length === 0 ? (
          <div className="rounded-lg border border-zinc-700 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-400">
            No faculty matches found for this school and department.
          </div>
        ) : (
          filteredFaculty.map((faculty) => (
            <article
              key={`${faculty.email}-${faculty.department}`}
              className="rounded-lg border border-zinc-700 bg-zinc-950/70 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">
                    {faculty.firstName} {faculty.lastName}
                  </h3>
                  <p className="text-xs text-zinc-400">{faculty.title}</p>
                </div>
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                  {faculty.matchingPercentage}% match
                </span>
              </div>

              <div className="mt-3 text-xs text-zinc-400">
                <p>
                  {faculty.school} · {faculty.department}
                </p>
                <p className="mt-1 text-zinc-300">
                  Research interest: {faculty.researchInterest}
                </p>
              </div>

              <div className="mt-3 flex flex-wrap gap-3 text-xs">
                <a
                  href={faculty.googleScholar}
                  target="_blank"
                  rel="noreferrer"
                  className="text-indigo-300 underline-offset-2 hover:underline"
                >
                  Google Scholar
                </a>
                <a
                  href={`mailto:${faculty.email}`}
                  className="text-zinc-300 underline-offset-2 hover:underline"
                >
                  {faculty.email}
                </a>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
