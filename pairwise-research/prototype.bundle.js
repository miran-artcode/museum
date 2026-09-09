(() => {
  // pairwise-research/research-spec.mjs
  var STUDY_VERSION = "pairwise-r2";
  var SELF_ASSESSMENT_VERSION = "artifact-rubric-v1";
  var PRE_SURVEY_GROUPS = [
    {
      id: "experience",
      title: "AI \uC774\uBBF8\uC9C0 \uACBD\uD5D8\uACFC \uBBF8\uC220 \uD559\uC2B5",
      note: "\uB2E8\uC6D0\uC744 \uC2DC\uC791\uD558\uAE30 \uC804\uC758 \uACBD\uD5D8\uC744 \uAE30\uC900\uC73C\uB85C \uB2F5\uD569\uB2C8\uB2E4.",
      items: [
        {
          id: "ai_count",
          text: "\uC774 \uB2E8\uC6D0\uC774 \uC2DC\uC791\uB418\uAE30 \uC804\uAE4C\uC9C0 \uC9C1\uC811 \uD504\uB86C\uD504\uD2B8\uB97C \uC785\uB825\uD558\uAC70\uB098 \uC218\uC815\uD558\uC5EC AI \uC774\uBBF8\uC9C0 \uC791\uC5C5\uC744 \uBA87 \uD68C \uD574 \uBCF4\uC558\uC2B5\uB2C8\uAE4C?",
          options: ["0\uD68C", "1\uD68C", "2~5\uD68C", "6~10\uD68C", "11\uD68C \uC774\uC0C1"],
          help: "\uD55C \uBC88 \uC549\uC544\uC11C \uC774\uC5B4\uC11C \uD55C \uC791\uC5C5\uC740 \uC0DD\uC131\uD55C \uC774\uBBF8\uC9C0 \uC218\uC640 \uAD00\uACC4\uC5C6\uC774 1\uD68C\uB85C \uC149\uB2C8\uB2E4."
        },
        {
          id: "ai_6m",
          text: "\uCD5C\uADFC 6\uAC1C\uC6D4 \uB3D9\uC548 \uC218\uC5C5 \uBC16\uC5D0\uC11C AI \uC774\uBBF8\uC9C0 \uB3C4\uAD6C\uB97C \uC0AC\uC6A9\uD55C \uBE48\uB3C4\uB294 \uC5B4\uB290 \uC815\uB3C4\uC785\uB2C8\uAE4C?",
          options: ["\uC804\uD600 \uC5C6\uC74C", "\uC6D4 1\uD68C \uBBF8\uB9CC", "\uC6D4 1~3\uD68C", "\uC8FC 1~2\uD68C", "\uC8FC 3\uD68C \uC774\uC0C1"]
        },
        {
          id: "ai_tools",
          text: "\uC9C0\uAE08\uAE4C\uC9C0 \uC9C1\uC811 \uC0AC\uC6A9\uD574 \uBCF8 AI \uC774\uBBF8\uC9C0 \uB3C4\uAD6C\uB294 \uBA87 \uC885\uB958\uC785\uB2C8\uAE4C?",
          options: ["0\uAC1C", "1\uAC1C", "2\uAC1C", "3\uAC1C", "4\uAC1C \uC774\uC0C1"]
        },
        {
          id: "ai_select",
          text: "\uC5EC\uB7EC AI \uACB0\uACFC\uBB3C\uC744 \uBE44\uAD50\uD558\uC5EC \uD558\uB098\uB97C \uC120\uD0DD\uD558\uACE0, \uC120\uD0DD \uC774\uC720\uB97C \uC801\uC5B4 \uBCF8 \uACBD\uD5D8\uC740 \uBA87 \uD68C\uC785\uB2C8\uAE4C?",
          options: ["0\uD68C", "1\uD68C", "2~3\uD68C", "4~5\uD68C", "6\uD68C \uC774\uC0C1"]
        },
        {
          id: "art_learning",
          text: "\uD559\uAD50 \uC815\uADDC \uBBF8\uC220\uC218\uC5C5\uC744 \uC81C\uC678\uD558\uACE0, \uBBF8\uC220\uD559\uC6D0\xB7\uAC1C\uC778\uC9C0\uB3C4 \uB4F1\uC5D0\uC11C \uC815\uAE30\uC801\uC73C\uB85C \uBBF8\uC220\uC744 \uBC30\uC6B4 \uAE30\uAC04\uC744 \uBAA8\uB450 \uD569\uCE58\uBA74 \uC5BC\uB9C8\uB098 \uB429\uB2C8\uAE4C?",
          options: ["\uC5C6\uC74C", "1\uB144 \uBBF8\uB9CC", "1\uB144 \uC774\uC0C1~3\uB144 \uBBF8\uB9CC", "3\uB144 \uC774\uC0C1~5\uB144 \uBBF8\uB9CC", "5\uB144 \uC774\uC0C1"]
        }
      ]
    },
    {
      id: "art_interest",
      title: "\uBBF8\uC220\uC5D0 \uB300\uD55C \uAD00\uC2EC",
      note: "1\uC810\uC740 \u2018\uC804\uD600 \uADF8\uB807\uC9C0 \uC54A\uB2E4\u2019, 7\uC810\uC740 \u2018\uB9E4\uC6B0 \uADF8\uB807\uB2E4\u2019\uC785\uB2C8\uB2E4.",
      scale: {
        min: 1,
        max: 7,
        low: "\uC804\uD600 \uADF8\uB807\uC9C0 \uC54A\uB2E4",
        high: "\uB9E4\uC6B0 \uADF8\uB807\uB2E4"
      },
      items: [
        { id: "vai_1", text: "\uB098\uB294 \uD559\uAD50 \uBBF8\uC220\uC218\uC5C5\uC744 \uC990\uAE30\uB294 \uD3B8\uC774\uB2E4." },
        { id: "vai_2", text: "\uB098\uB294 \uB2E4\uB978 \uC0AC\uB78C\uACFC \uBBF8\uC220\uC5D0 \uAD00\uD574 \uC774\uC57C\uAE30\uD558\uB294 \uAC83\uC744 \uC88B\uC544\uD55C\uB2E4." },
        { id: "vai_3", text: "\uB0B4 \uC8FC\uBCC0 \uC0AC\uB78C\uB4E4\uC740 \uBBF8\uC220\uC5D0 \uAD00\uC2EC\uC774 \uC788\uB294 \uD3B8\uC774\uB2E4." },
        { id: "vai_4", text: "\uB098\uB294 \uBBF8\uC220\uC5D0 \uAD00\uC2EC\uC774 \uB9CE\uB2E4." },
        { id: "vai_5", text: "\uB098\uB294 \uC0C8\uB86D\uAC70\uB098 \uC778\uC0C1\uC801\uC778 \uBBF8\uC220 \uACBD\uD5D8\uC744 \uCC3E\uC544\uBCF4\uB294 \uD3B8\uC774\uB2E4." },
        { id: "vai_6", text: "\uB098\uB294 \uC77C\uC0C1\uC5D0\uC11C \uBBF8\uC220 \uC791\uD488\uC774\uB098 \uC2DC\uAC01\uC801 \uB300\uC0C1\uC744 \uC790\uC8FC \uB208\uC5EC\uACA8\uBCF8\uB2E4." },
        { id: "vai_7", text: "\uC6B0\uB9AC \uAC00\uC871\uC740 \uBBF8\uC220\uC5D0 \uAD00\uC2EC\uC774 \uC788\uB294 \uD3B8\uC774\uB2E4." }
      ]
    },
    {
      id: "art_exposure",
      title: "\uCD5C\uADFC 12\uAC1C\uC6D4\uC758 \uBBF8\uC220 \uACBD\uD5D8",
      note: "1\uC810\uC740 \u20181\uB144\uC5D0 \uD55C \uBC88 \uBBF8\uB9CC\u2019, 7\uC810\uC740 \u2018\uC8FC 1\uD68C \uC774\uC0C1\u2019\uC785\uB2C8\uB2E4.",
      scale: {
        min: 1,
        max: 7,
        low: "1\uB144\uC5D0 \uD55C \uBC88 \uBBF8\uB9CC",
        high: "\uC8FC 1\uD68C \uC774\uC0C1",
        labels: ["1\uB144\uC5D0 \uD55C \uBC88 \uBBF8\uB9CC", "\uC5F0 1\uD68C", "\uBC18\uB144\uC5D0 1\uD68C", "3\uAC1C\uC6D4\uC5D0 1\uD68C", "\uC6D4 1\uD68C", "2\uC8FC\uC5D0 1\uD68C", "\uC8FC 1\uD68C \uC774\uC0C1"]
      },
      items: [
        { id: "vai_8", text: "\uBBF8\uC220\uAD00\uC774\uB098 \uAC24\uB7EC\uB9AC \uC804\uC2DC\uB97C \uAD00\uB78C\uD588\uB2E4." },
        { id: "vai_9", text: "\uBBF8\uC220 \uAD00\uB828 \uCC45\xB7\uC7A1\uC9C0\xB7\uB3C4\uB85D\xB7\uAE34 \uAE00\uC744 \uC77D\uC5C8\uB2E4." },
        { id: "vai_10", text: "\uAD00\uC2EC \uC788\uB294 \uC791\uD488\uC774\uB098 \uC774\uBBF8\uC9C0\uB97C \uC2A4\uC2A4\uB85C \uCC3E\uC544\uBCF4\uC558\uB2E4." },
        { id: "vai_11", text: "\uBBF8\uC220 \uAC15\uC5F0\xB7\uB3C4\uC2A8\uD2B8\xB7\uC791\uD488 \uD574\uC124\uC744 \uB4E4\uC5C8\uB2E4." }
      ]
    },
    {
      id: "ai_attitude",
      title: "AI\uC5D0 \uB300\uD55C \uC77C\uBC18\uC801\uC778 \uC0DD\uAC01",
      note: "1\uC810\uC740 \u2018\uC804\uD600 \uB3D9\uC758\uD558\uC9C0 \uC54A\uB294\uB2E4\u2019, 10\uC810\uC740 \u2018\uB9E4\uC6B0 \uB3D9\uC758\uD55C\uB2E4\u2019\uC785\uB2C8\uB2E4. \uBBF8\uC220 \uC791\uD488\uC774 \uC544\uB2C8\uB77C AI \uC804\uBC18\uC5D0 \uB300\uD55C \uC0DD\uAC01\uC744 \uB2F5\uD569\uB2C8\uB2E4.",
      scale: {
        min: 1,
        max: 10,
        low: "\uC804\uD600 \uB3D9\uC758\uD558\uC9C0 \uC54A\uB294\uB2E4",
        high: "\uB9E4\uC6B0 \uB3D9\uC758\uD55C\uB2E4"
      },
      items: [
        { id: "aias_1", text: "AI\uB294 \uB098\uC758 \uC0DD\uD65C\uC744 \uB354 \uB098\uC544\uC9C0\uAC8C \uD560 \uC218 \uC788\uB2E4." },
        { id: "aias_2", text: "AI\uB294 \uB098\uC758 \uD559\uC2B5\uC774\uB098 \uC791\uC5C5\uC744 \uD5A5\uC0C1\uD560 \uC218 \uC788\uB2E4." },
        { id: "aias_3", text: "\uB098\uB294 \uC55E\uC73C\uB85C AI \uAE30\uC220\uC744 \uC0AC\uC6A9\uD560 \uC758\uD5A5\uC774 \uC788\uB2E4." },
        { id: "aias_4", text: "AI \uAE30\uC220\uC740 \uC804\uBC18\uC801\uC73C\uB85C \uC778\uB958\uC5D0\uAC8C \uAE0D\uC815\uC801\uC774\uB77C\uACE0 \uC0DD\uAC01\uD55C\uB2E4." }
      ]
    }
  ];
  var PRE_SURVEY_ITEMS = PRE_SURVEY_GROUPS.flatMap(
    (group) => group.items.map((item) => ({
      ...item,
      groupId: group.id,
      groupTitle: group.title,
      options: item.options || null,
      scale: group.scale || null
    }))
  );
  var PAIRWISE_DEFAULTS = Object.freeze({
    /* 학생에게 보이는 총 12화면 = 새로운 본 비교 11회 + 숨은 역순 반복 1회. */
    mainTrials: 11,
    reasonRate: 0.2,
    repeatRate: 0.1,
    ratingWorks: 6,
    question: "\uB450 \uC791\uD488 \uC911 \uC774 \uC218\uC5C5\uC758 \uC9C8\uBB38\uC778 \u2018\uBB34\uC5C7\uC774 \uC774\uBBF8\uC9C0\uB97C \uBBF8\uC220\uB85C \uB9CC\uB4DC\uB294\uAC00?\u2019\uC5D0 \uB354 \uC124\uB4DD\uB825 \uC788\uAC8C \uC751\uB2F5\uD558\uB294 \uC791\uD488\uC744 \uD558\uB098 \uACE0\uB974\uC138\uC694."
  });
  var SELF_SCORE_LABELS = [
    "\uAC70\uC758 \uC131\uB9BD\uD558\uC9C0 \uC54A\uC74C",
    "\uC77C\uBD80\uB9CC \uC131\uB9BD\uD568",
    "\uAE30\uBCF8\uC801\uC73C\uB85C \uC131\uB9BD\uD568",
    "\uC124\uB4DD\uB825 \uC788\uAC8C \uC131\uB9BD\uD568",
    "\uB9E4\uC6B0 \uC124\uB4DD\uB825 \uC788\uAC8C \uC131\uB9BD\uD568"
  ];
  var SELF_ASSESSMENT_ITEMS = [
    {
      id: "overall",
      label: "\uC885\uD569 \uC124\uB4DD\uB825",
      text: "\uC774 \uC791\uD488\uC740 \uC218\uC5C5\uC758 \uC9C8\uBB38 \u2018\uBB34\uC5C7\uC774 \uC774\uBBF8\uC9C0\uB97C \uBBF8\uC220\uB85C \uB9CC\uB4DC\uB294\uAC00?\u2019\uC5D0 \uC5BC\uB9C8\uB098 \uC124\uB4DD\uB825 \uC788\uAC8C \uC751\uB2F5\uD569\uB2C8\uAE4C?"
    },
    {
      id: "veri",
      label: "\uC774\uBBF8\uC9C0\uC758 \uD54D\uC9C4\uC131",
      text: "\uC720\uBB3C \uAE30\uB85D \uC774\uBBF8\uC9C0\uC758 \uD615\uC2DD\uC778 \uBC30\uACBD\xB7\uC870\uBA85\xB7\uC2A4\uCF00\uC77C\uC774 \uC11C\uB85C \uC5B4\uAE0B\uB098\uC9C0 \uC54A\uACE0 \uC131\uB9BD\uD569\uB2C8\uAE4C?"
    },
    {
      id: "cause",
      label: "\uD754\uC801\uC758 \uC778\uACFC",
      text: "\uB9C8\uBAA8\xB7\uD30C\uC190\xB7\uC624\uC5FC\xB7\uC218\uB9AC\uC758 \uC704\uCE58\uC640 \uBAA8\uC2B5\uC774 \uC774 \uBB3C\uAC74\uC758 \uC4F0\uC784\uACFC \uAD6C\uCCB4\uC801\uC73C\uB85C \uC774\uC5B4\uC9D1\uB2C8\uAE4C?"
    },
    {
      id: "plate",
      label: "\uBA85\uC81C\uD45C\uC758 \uC791\uB3D9",
      text: "\uC81C\uBAA9\xB7\uC720\uBB3C\uBA85\xB7\uC791\uD488\uC124\uBA85\uC744 \uC77D\uC740 \uB4A4 \uC774\uBBF8\uC9C0\uC758 \uC758\uBBF8\uAC00 \uB354 \uAD6C\uCCB4\uC801\uC73C\uB85C \uD615\uC131\uB429\uB2C8\uAE4C?"
    },
    {
      id: "voice",
      label: "\uBB38\uC81C\uC758 \uC804\uB2EC",
      text: "\uC791\uD488\uC774 \uB2E4\uB8E8\uB294 \uC0AC\uD68C\uBB38\uC81C\uC640 \uD0DC\uB3C4(\uACE0\uBC1C\xB7\uACBD\uACE0\xB7\uACF5\uAC10\xB7\uAE30\uB85D\xB7\uC9C8\uBB38)\uAC00 \uC791\uD488 \uC548\uC5D0\uC11C \uC77D\uD799\uB2C8\uAE4C?"
    }
  ];
  var SELF_CHANGE_REASON_OPTIONS = [
    { value: "new_or_shifted", label: "\uCC98\uC74C\uACFC \uB2E4\uB974\uAC8C \uC911\uC694\uD558\uAC8C \uBCF8 \uAE30\uC900\uC774\uB098 \uADFC\uAC70\uAC00 \uC788\uC74C" },
    { value: "same_basis", label: "\uCC98\uC74C\uACFC \uBE44\uC2B7\uD55C \uAE30\uC900\uACFC \uADFC\uAC70\uB85C \uD310\uB2E8\uD568" },
    { value: "unclear", label: "\uC774\uC720\uAC00 \uBD84\uBA85\uD558\uC9C0 \uC54A\uAC70\uB098 \uAE30\uC5B5\uB098\uC9C0 \uC54A\uC74C" },
    { value: "other", label: "\uADF8 \uBC16\uC758 \uC774\uC720" }
  ];
  var CONFIDENCE_LABELS = [
    "\uC804\uD600 \uD655\uC2E0\uD558\uC9C0 \uC54A\uC74C",
    "\uBCC4\uB85C \uD655\uC2E0\uD558\uC9C0 \uC54A\uC74C",
    "\uBCF4\uD1B5",
    "\uB300\uCCB4\uB85C \uD655\uC2E0\uD568",
    "\uB9E4\uC6B0 \uD655\uC2E0\uD568"
  ];
  var AI_RATING_ITEMS = [
    { id: "ai_like", text: "\uC774 \uC774\uBBF8\uC9C0\uB294 \uC804\uD615\uC801\uC778 \uC0DD\uC131\uD615 AI \uC774\uBBF8\uC9C0\uCC98\uB7FC \uB290\uAEF4\uC9C4\uB2E4." },
    { id: "ai_trace", text: "\uC774 \uC774\uBBF8\uC9C0\uC5D0\uC11C\uB294 \uC0DD\uC131\uD615 AI \uD2B9\uC720\uC758 \uC774\uC0C1\uD55C \uD754\uC801\uC774 \uB208\uC5D0 \uB748\uB2E4." },
    { id: "future_form", text: "\uC774 \uC774\uBBF8\uC9C0\uC758 \uC0AC\uBB3C \uD615\uD0DC\uB294 \uB0AF\uC124\uAC70\uB098 \uBBF8\uB798\uC801\uC73C\uB85C \uB290\uAEF4\uC9C4\uB2E4." },
    { id: "agency", text: "\uC774 \uC791\uD488\uC5D0\uC11C\uB294 \uB9CC\uB4E0 \uC0AC\uB78C\uC758 \uC758\uB3C4\uC801\uC778 \uC120\uD0DD\uACFC \uD1B5\uC81C\uAC00 \uB290\uAEF4\uC9C4\uB2E4." },
    { id: "meaning", text: "\uC774 \uC791\uD488\uC774 \uBB34\uC5C7\uC744 \uC774\uC57C\uAE30\uD558\uB824\uB294\uC9C0 \uC77D\uC744 \uC218 \uC788\uB2E4." },
    { id: "authenticity", text: "\uC774 \uC791\uD488\uC5D0\uB294 \uB2E8\uC21C \uC0DD\uC131 \uC774\uC0C1\uC758 \uC9C4\uC815\uC131 \uC788\uB294 \uC758\uB3C4\uAC00 \uB290\uAEF4\uC9C4\uB2E4." }
  ];
  var AI_CUE_OPTIONS = [
    { value: "structure", label: "\uD615\uD0DC\xB7\uBD80\uD488\uC758 \uC5F0\uACB0" },
    { value: "light", label: "\uBE5B\uACFC \uADF8\uB9BC\uC790" },
    { value: "material", label: "\uC7AC\uC9C8\xB7\uD45C\uBA74" },
    { value: "perspective", label: "\uD06C\uAE30\xB7\uC6D0\uADFC\xB7\uCD08\uC810" },
    { value: "text", label: "\uBB38\uC790\xB7\uC138\uBD80 \uBB18\uC0AC" },
    { value: "smooth", label: "\uC9C0\uB098\uCE58\uAC8C \uB9E4\uB048\uD558\uAC70\uB098 \uC644\uBCBD\uD568" },
    { value: "future", label: "\uB0AF\uC124\uAC70\uB098 \uBBF8\uB798\uC801\uC778 \uD615\uD0DC" },
    { value: "other", label: "\uAE30\uD0C0" },
    { value: "none", label: "\uD2B9\uBCC4\uD55C \uADFC\uAC70 \uC5C6\uC74C" }
  ];
  function stringHash(input) {
    let h = 2166136261;
    const s = String(input);
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function shuffled(values, random) {
    const out = [...values];
    for (let i = out.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  function pairKey(a, b) {
    return [String(a), String(b)].sort().join("::");
  }
  var compareText = (a, b) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
  var hexHash = (value) => stringHash(typeof value === "string" ? value : JSON.stringify(value)).toString(16).padStart(8, "0");
  function contextPayloadHash(work) {
    return hexHash({
      id: work.id,
      title: work.title || "",
      relic: work.relic || "",
      statement: work.statement || work.note || "",
      contextVersion: work.contextVersion || ""
    });
  }
  function allPairs(works) {
    const pairs = [];
    for (let i = 0; i < works.length; i += 1) {
      for (let j = i + 1; j < works.length; j += 1) {
        pairs.push([works[i], works[j]]);
      }
    }
    return pairs;
  }
  var countOf = (map, key) => map.get(key) || 0;
  var bump = (map, key) => map.set(key, countOf(map, key) + 1);
  var choose2 = (value) => value * (value - 1) / 2;
  function normalizedId(value) {
    return String(value ?? "").trim();
  }
  function normalizeRosterForGeneration(works, evaluators) {
    if (!Array.isArray(works) || !works.length) throw new Error("\uC791\uD488 \uBA85\uB2E8\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
    if (!Array.isArray(evaluators) || !evaluators.length) throw new Error("\uD3C9\uAC00\uC790 \uBA85\uB2E8\uC774 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
    const cleanWorks = works.map((work, index) => {
      if (!work || typeof work !== "object") throw new Error(`\uC791\uD488 ${index + 1}\uC758 \uC790\uB8CC \uD615\uC2DD\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.`);
      const id = normalizedId(work.id);
      const ownerId = normalizedId(work.ownerId);
      if (!id) throw new Error(`\uC791\uD488 ${index + 1}\uC758 id\uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.`);
      if (id.includes("::")) throw new Error(`\uC791\uD488 id\uC5D0\uB294 \uC608\uC57D \uAD6C\uBD84\uC790 ::\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4: ${id}`);
      if (!ownerId) throw new Error(`\uC791\uD488 ${id}\uC758 ownerId\uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.`);
      return { ...work, id, ownerId };
    }).sort((a, b) => compareText(a.id, b.id));
    const workIds = /* @__PURE__ */ new Set();
    const ownerIds = /* @__PURE__ */ new Set();
    for (const work of cleanWorks) {
      if (workIds.has(work.id)) throw new Error(`\uC911\uBCF5 \uC791\uD488 id: ${work.id}`);
      if (ownerIds.has(work.ownerId)) throw new Error(`\uD55C \uD3C9\uAC00\uC790\uC5D0\uAC8C \uC791\uD488\uC774 \uB458 \uC774\uC0C1 \uC5F0\uACB0\uB428: ${work.ownerId}`);
      workIds.add(work.id);
      ownerIds.add(work.ownerId);
    }
    const rawPeople = evaluators.map(normalizedId);
    if (rawPeople.some((id) => !id)) throw new Error("\uD3C9\uAC00\uC790 id\uAC00 \uBE44\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.");
    if (new Set(rawPeople).size !== rawPeople.length) throw new Error("\uD3C9\uAC00\uC790 id\uAC00 \uC911\uBCF5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    const people = [...rawPeople].sort(compareText);
    const peopleSet = new Set(people);
    for (const work of cleanWorks) {
      if (!peopleSet.has(work.ownerId)) throw new Error(`\uC791\uD488 ${work.id}\uC758 ownerId\uAC00 \uD3C9\uAC00\uC790 \uBA85\uB2E8\uC5D0 \uC5C6\uC2B5\uB2C8\uB2E4: ${work.ownerId}`);
    }
    for (const evaluatorId of people) {
      if (!ownerIds.has(evaluatorId)) throw new Error(`\uD3C9\uAC00\uC790 ${evaluatorId}\uC758 \uC790\uAE30 \uC791\uD488\uC774 \uC815\uD655\uD788 1\uC810 \uD544\uC694\uD569\uB2C8\uB2E4.`);
    }
    return { cleanWorks, people };
  }
  function contextTargets(k, evaluatorIndex, extraStart) {
    const low = Math.floor(k / 2);
    const high = Math.ceil(k / 2);
    if (low === high) return { image_only: low, image_context: low };
    return (evaluatorIndex + extraStart) % 2 === 0 ? { image_only: high, image_context: low } : { image_only: low, image_context: high };
  }
  function contextWorkSplit(workCount, targets, preferOnlyExtra) {
    const feasible = [];
    for (let imageOnlyWorks = 0; imageOnlyWorks <= workCount; imageOnlyWorks += 1) {
      const contextWorks = workCount - imageOnlyWorks;
      if (choose2(imageOnlyWorks) < targets.image_only || choose2(contextWorks) < targets.image_context) continue;
      const desiredDirection = targets.image_only === targets.image_context ? preferOnlyExtra ? -1 : 1 : targets.image_only > targets.image_context ? -1 : 1;
      const actualDirection = imageOnlyWorks === contextWorks ? 0 : imageOnlyWorks > contextWorks ? -1 : 1;
      feasible.push({
        imageOnlyWorks,
        balanceCost: Math.abs(imageOnlyWorks - contextWorks),
        directionCost: actualDirection === 0 || actualDirection === desiredDirection ? 0 : 1
      });
    }
    feasible.sort((a, b) => a.balanceCost - b.balanceCost || a.directionCost - b.directionCost || (preferOnlyExtra ? b.imageOnlyWorks - a.imageOnlyWorks : a.imageOnlyWorks - b.imageOnlyWorks));
    return feasible.length ? feasible[0].imageOnlyWorks : null;
  }
  function makeContextSchedule(targets, startWithOnly) {
    const remaining = { ...targets };
    const schedule = [];
    let next = startWithOnly ? "image_only" : "image_context";
    while (remaining.image_only + remaining.image_context > 0) {
      if (!remaining[next]) next = next === "image_only" ? "image_context" : "image_only";
      schedule.push(next);
      remaining[next] -= 1;
      next = next === "image_only" ? "image_context" : "image_only";
    }
    return schedule;
  }
  function orientEdgesBalanced(edges, seed) {
    if (!edges.length) return;
    const degrees = /* @__PURE__ */ new Map();
    for (const edge of edges) {
      bump(degrees, edge.a);
      bump(degrees, edge.b);
    }
    const odd = [...degrees.entries()].filter(([, degree]) => degree % 2 === 1).map(([id]) => id).sort((a, b) => {
      const ah = stringHash(`${seed}::odd::${a}`);
      const bh = stringHash(`${seed}::odd::${b}`);
      return ah - bh || compareText(a, b);
    });
    const working = edges.map((edge) => ({ ...edge, dummy: false, key: `real::${edge.trial.trialId}` }));
    for (let index = 0; index < odd.length; index += 2) {
      working.push({ a: odd[index], b: odd[index + 1], dummy: true, key: `dummy::${index / 2}` });
    }
    const adjacency = /* @__PURE__ */ new Map();
    working.forEach((edge, edgeIndex) => {
      if (!adjacency.has(edge.a)) adjacency.set(edge.a, []);
      if (!adjacency.has(edge.b)) adjacency.set(edge.b, []);
      adjacency.get(edge.a).push(edgeIndex);
      adjacency.get(edge.b).push(edgeIndex);
    });
    for (const [vertex, edgeIndexes] of adjacency) {
      edgeIndexes.sort((a, b) => {
        const ah = stringHash(`${seed}::edge::${vertex}::${working[a].key}`);
        const bh = stringHash(`${seed}::edge::${vertex}::${working[b].key}`);
        return bh - ah || b - a;
      });
    }
    const used = /* @__PURE__ */ new Set();
    const starts = [...adjacency.keys()].sort(compareText);
    for (const start of starts) {
      if (!(adjacency.get(start) || []).some((edgeIndex) => !used.has(edgeIndex))) continue;
      const stack = [start];
      while (stack.length) {
        const vertex = stack[stack.length - 1];
        const available = adjacency.get(vertex) || [];
        while (available.length && used.has(available[available.length - 1])) available.pop();
        if (!available.length) {
          stack.pop();
          continue;
        }
        const edgeIndex = available.pop();
        if (used.has(edgeIndex)) continue;
        used.add(edgeIndex);
        const edge = working[edgeIndex];
        const next = edge.a === vertex ? edge.b : edge.a;
        if (!edge.dummy) {
          edge.trial.leftWorkId = vertex;
          edge.trial.rightWorkId = next;
        }
        stack.push(next);
      }
    }
  }
  function trialPayloadHash(context, leftWorkId, rightWorkId, workById) {
    return hexHash([
      context,
      contextPayloadHash(workById.get(leftWorkId)),
      contextPayloadHash(workById.get(rightWorkId))
    ].join("::"));
  }
  function makeClassAssignments({
    works,
    evaluators,
    k = PAIRWISE_DEFAULTS.mainTrials,
    seed = "pairwise-r2",
    reasonRate = PAIRWISE_DEFAULTS.reasonRate,
    includeRepeat = true,
    repeatRate = PAIRWISE_DEFAULTS.repeatRate,
    minRepeatGap = 3
  } = {}) {
    const { cleanWorks, people } = normalizeRosterForGeneration(works, evaluators);
    const requestedTrials = Number(k);
    const requestedReasonRate = Number(reasonRate);
    const requestedRepeatRate = Number(repeatRate);
    const requestedGap = Number(minRepeatGap);
    if (!Number.isInteger(requestedTrials) || requestedTrials < 1) throw new Error("k\uB294 1 \uC774\uC0C1\uC758 \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
    if (!Number.isFinite(requestedReasonRate) || requestedReasonRate < 0 || requestedReasonRate > 1) throw new Error("reasonRate\uB294 0 \uC774\uC0C1 1 \uC774\uD558\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
    if (!Number.isFinite(requestedRepeatRate) || requestedRepeatRate < 0 || requestedRepeatRate > 1) throw new Error("repeatRate\uB294 0 \uC774\uC0C1 1 \uC774\uD558\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
    if (!Number.isInteger(requestedGap) || requestedGap < 0) throw new Error("minRepeatGap\uC740 0 \uC774\uC0C1\uC758 \uC815\uC218\uC5EC\uC57C \uD569\uB2C8\uB2E4.");
    const random = mulberry32(stringHash(seed));
    const workById = new Map(cleanWorks.map((work) => [work.id, work]));
    const workUse = /* @__PURE__ */ new Map();
    const pairUse = /* @__PURE__ */ new Map();
    const plans = {};
    const classContextExtraStart = stringHash(`${seed}::class-context-extra`) % 2;
    for (let evaluatorIndex = 0; evaluatorIndex < people.length; evaluatorIndex += 1) {
      const evaluatorId = people[evaluatorIndex];
      const available = cleanWorks.filter((work) => work.ownerId !== evaluatorId);
      const contextRandom = mulberry32(stringHash([seed, evaluatorId, "context-v1"].join("::")));
      const contextOrder = shuffled(available.map((work) => work.id), contextRandom);
      const targets = contextTargets(requestedTrials, evaluatorIndex, classContextExtraStart);
      const contextStart = stringHash(seed + "::" + evaluatorId) % 2;
      const imageOnlyWorks = contextWorkSplit(available.length, targets, contextStart === 0);
      if (imageOnlyWorks == null) {
        throw new Error(`${evaluatorId}: \uB450 \uB9E5\uB77D\uC870\uAC74\uC5D0\uC11C \uBCF8 \uBE44\uAD50 ${requestedTrials}\uD68C\uB97C \uB9CC\uB4E4 \uC791\uD488 \uC218\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4.`);
      }
      const contextByWork = {};
      contextOrder.forEach((workId, index) => {
        contextByWork[workId] = index < imageOnlyWorks ? "image_only" : "image_context";
      });
      const candidates = shuffled(
        allPairs(available).filter(([a, b]) => contextByWork[a.id] === contextByWork[b.id]),
        random
      );
      const personPair = /* @__PURE__ */ new Set();
      const personWork = /* @__PURE__ */ new Map();
      const personContext = { image_only: 0, image_context: 0 };
      const main = [];
      const schedule = makeContextSchedule(targets, contextStart === 0);
      for (let round = 0; round < requestedTrials; round += 1) {
        const desiredContext = schedule[round];
        let bestScore = Infinity;
        let best = null;
        for (const candidate of candidates) {
          const [a2, b2] = candidate;
          const pk2 = pairKey(a2.id, b2.id);
          if (personPair.has(pk2)) continue;
          if (contextByWork[a2.id] !== desiredContext) continue;
          const pa = countOf(personWork, a2.id);
          const pb = countOf(personWork, b2.id);
          const score = (pa * pa + pb * pb) * 1e3 + (countOf(workUse, a2.id) + countOf(workUse, b2.id)) * 12 + countOf(pairUse, pk2) * 6 + random();
          if (score < bestScore) {
            bestScore = score;
            best = candidate;
          }
        }
        if (!best) throw new Error(`${evaluatorId}: ${desiredContext} \uC870\uAC74\uC758 \uBCF8 \uBE44\uAD50 ${requestedTrials}\uD68C\uB97C \uCC44\uC6B8 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`);
        const [a, b] = best;
        const pk = pairKey(a.id, b.id);
        const context = contextByWork[a.id];
        const trial = {
          trialId: evaluatorId + "-T" + String(round + 1).padStart(2, "0"),
          pairId: pk,
          trialIndex: round,
          leftWorkId: a.id,
          rightWorkId: b.id,
          context,
          contextAssignmentUnit: "evaluator_work",
          contextPayloadHash: null,
          reasonPrompted: false,
          repeatOf: null
        };
        main.push(trial);
        personPair.add(pk);
        bump(personWork, a.id);
        bump(personWork, b.id);
        bump(workUse, a.id);
        bump(workUse, b.id);
        bump(pairUse, pk);
        personContext[context] += 1;
      }
      const publicContextByWork = Object.fromEntries(Object.entries(contextByWork).sort(([a], [b]) => compareText(a, b)));
      const payloadHashByWork = Object.fromEntries(available.map((work) => [work.id, contextPayloadHash(work)]));
      plans[evaluatorId] = {
        version: STUDY_VERSION,
        algorithmVersion: "balanced-class-v3",
        rosterVersion: String(seed),
        evaluatorId,
        contextAssignmentUnit: "evaluator_work",
        contextByWork: publicContextByWork,
        contextPayloadHashByWork: payloadHashByWork,
        requestedMainTrialCount: requestedTrials,
        mainTrialCount: main.length,
        requestedRepeatTrialCount: 0,
        repeatTrialCount: 0,
        repeatRateNominal: requestedRepeatRate,
        minRepeatGap: requestedGap,
        trials: main
      };
    }
    const repeatDescriptors = [];
    const mainContextTotals = { image_only: 0, image_context: 0 };
    let totalRepeats = 0;
    for (const evaluatorId of people) {
      const plan = plans[evaluatorId];
      const main = plan.trials;
      for (const trial of main) mainContextTotals[trial.context] += 1;
      const repeatN = includeRepeat && requestedRepeatRate > 0 ? Math.round(main.length * requestedRepeatRate) : 0;
      const eligible = main.filter((trial) => trial.trialIndex <= main.length - requestedGap - 1);
      if (repeatN > eligible.length) throw new Error(`${evaluatorId}: \uBC18\uBCF5 ${repeatN}\uD68C\uC640 \uD654\uBA74 \uAC04\uACA9 ${requestedGap}\uD68C\uB97C \uD568\uAED8 \uBC30\uCE58\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`);
      const eligibleOnly = eligible.filter((trial) => trial.context === "image_only");
      const eligibleContext = eligible.filter((trial) => trial.context === "image_context");
      const mainOnly = main.filter((trial) => trial.context === "image_only").length;
      const mainContext = main.length - mainOnly;
      const possibleOnlyCounts = [];
      for (let onlyRepeats = 0; onlyRepeats <= repeatN; onlyRepeats += 1) {
        if (onlyRepeats > eligibleOnly.length || repeatN - onlyRepeats > eligibleContext.length) continue;
        const finalOnly = mainOnly + onlyRepeats;
        const finalContext = mainContext + repeatN - onlyRepeats;
        if (Math.abs(finalOnly - finalContext) <= 1) possibleOnlyCounts.push(onlyRepeats);
      }
      if (!possibleOnlyCounts.length) throw new Error(`${evaluatorId}: \uBC18\uBCF5\uC744 \uD3EC\uD568\uD55C \uD559\uC0DD\uBCC4 \uB9E5\uB77D\uC870\uAC74 \uADE0\uD615\uC744 \uB9CC\uB4E4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.`);
      if (stringHash(`${seed}::repeat-option::${evaluatorId}`) % 2) possibleOnlyCounts.reverse();
      repeatDescriptors.push({ evaluatorId, plan, repeatN, eligibleOnly, eligibleContext, possibleOnlyCounts });
      totalRepeats += repeatN;
    }
    let states = /* @__PURE__ */ new Map([[0, []]]);
    for (const descriptor of repeatDescriptors) {
      const nextStates = /* @__PURE__ */ new Map();
      for (const [sum, choices] of states) {
        for (const choice of descriptor.possibleOnlyCounts) {
          if (!nextStates.has(sum + choice)) nextStates.set(sum + choice, [...choices, choice]);
        }
      }
      states = nextStates;
    }
    const totalScreens = people.length * requestedTrials + totalRepeats;
    const desiredOnlyTotals = [.../* @__PURE__ */ new Set([Math.floor(totalScreens / 2), Math.ceil(totalScreens / 2)])];
    if (stringHash(`${seed}::screen-context-total`) % 2) desiredOnlyTotals.reverse();
    let repeatOnlyChoices = null;
    for (const desiredOnly of desiredOnlyTotals) {
      const needed = desiredOnly - mainContextTotals.image_only;
      if (states.has(needed)) {
        repeatOnlyChoices = states.get(needed);
        break;
      }
    }
    if (!repeatOnlyChoices) throw new Error("\uBC18\uBCF5\uC744 \uD3EC\uD568\uD55C \uD559\uAE09 \uC804\uCCB4 \uB9E5\uB77D\uC870\uAC74 \uC218\uB97C 1 \uC774\uB0B4\uB85C \uB9DE\uCD9C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const displayExposure = /* @__PURE__ */ new Map();
    for (const plan of Object.values(plans)) {
      for (const trial of plan.trials) {
        bump(displayExposure, trial.leftWorkId);
        bump(displayExposure, trial.rightWorkId);
      }
    }
    const selectedByEvaluator = /* @__PURE__ */ new Map();
    const repeatedTrialIds = /* @__PURE__ */ new Set();
    const chooseRepeatSources = (pool, count, evaluatorId) => {
      const remaining = [...pool];
      const selected = [];
      while (selected.length < count) {
        remaining.sort((a, b) => {
          const aMax = Math.max(countOf(displayExposure, a.leftWorkId), countOf(displayExposure, a.rightWorkId));
          const bMax = Math.max(countOf(displayExposure, b.leftWorkId), countOf(displayExposure, b.rightWorkId));
          const aSum = countOf(displayExposure, a.leftWorkId) + countOf(displayExposure, a.rightWorkId);
          const bSum = countOf(displayExposure, b.leftWorkId) + countOf(displayExposure, b.rightWorkId);
          const ah = stringHash(`${seed}::repeat-source::${evaluatorId}::${a.trialId}`);
          const bh = stringHash(`${seed}::repeat-source::${evaluatorId}::${b.trialId}`);
          return aMax - bMax || aSum - bSum || ah - bh || compareText(a.trialId, b.trialId);
        });
        const source = remaining.shift();
        if (!source) throw new Error(`${evaluatorId}: \uBC18\uBCF5 \uC6D0\uBCF8 \uC120\uD0DD \uC2E4\uD328`);
        selected.push(source);
        bump(displayExposure, source.leftWorkId);
        bump(displayExposure, source.rightWorkId);
      }
      return selected;
    };
    repeatDescriptors.forEach((descriptor, index) => {
      const onlyCount = repeatOnlyChoices[index];
      const selected = [
        ...chooseRepeatSources(descriptor.eligibleOnly, onlyCount, descriptor.evaluatorId),
        ...chooseRepeatSources(descriptor.eligibleContext, descriptor.repeatN - onlyCount, descriptor.evaluatorId)
      ].sort((a, b) => {
        const ah = stringHash(`${seed}::repeat-order::${descriptor.evaluatorId}::${a.trialId}`);
        const bh = stringHash(`${seed}::repeat-order::${descriptor.evaluatorId}::${b.trialId}`);
        return ah - bh || compareText(a.trialId, b.trialId);
      });
      selectedByEvaluator.set(descriptor.evaluatorId, selected);
      for (const source of selected) repeatedTrialIds.add(source.trialId);
      descriptor.plan.requestedRepeatTrialCount = descriptor.repeatN;
    });
    const nonRepeatedEdges = [];
    for (const plan of Object.values(plans)) {
      for (const trial of plan.trials) {
        const a = trial.leftWorkId;
        const b = trial.rightWorkId;
        if (repeatedTrialIds.has(trial.trialId)) {
          if (stringHash(`${seed}::repeated-edge-side::${trial.trialId}`) % 2) {
            trial.leftWorkId = b;
            trial.rightWorkId = a;
          } else {
            trial.leftWorkId = a;
            trial.rightWorkId = b;
          }
        } else {
          nonRepeatedEdges.push({ a, b, trial });
        }
      }
    }
    orientEdgesBalanced(nonRepeatedEdges, seed);
    for (const evaluatorId of people) {
      const plan = plans[evaluatorId];
      const main = plan.trials;
      for (const trial of main) {
        trial.contextPayloadHash = trialPayloadHash(trial.context, trial.leftWorkId, trial.rightWorkId, workById);
      }
      const repeatSources = selectedByEvaluator.get(evaluatorId) || [];
      const trials = [...main];
      repeatSources.forEach((source, repeatIndex) => {
        const sourcePosition = trials.findIndex((trial) => trial.trialId === source.trialId);
        const desiredPosition = Math.floor((repeatIndex + 1) * (main.length + repeatSources.length) / (repeatSources.length + 1));
        const insertAt = Math.min(trials.length, Math.max(sourcePosition + requestedGap + 1, desiredPosition));
        if (insertAt - sourcePosition - 1 < requestedGap) throw new Error(`${evaluatorId}: \uBC18\uBCF5 \uC0AC\uC774 \uD654\uBA74 \uC218 \uACC4\uC0B0 \uC2E4\uD328`);
        const repeat = {
          ...source,
          trialId: evaluatorId + "-R" + String(repeatIndex + 1).padStart(2, "0"),
          trialIndex: main.length + repeatIndex,
          leftWorkId: source.rightWorkId,
          rightWorkId: source.leftWorkId,
          contextPayloadHash: trialPayloadHash(source.context, source.rightWorkId, source.leftWorkId, workById),
          reasonPrompted: false,
          reasonDraw: null,
          reasonAlgoVersion: "class-hash-v1",
          repeatOf: source.trialId
        };
        trials.splice(insertAt, 0, repeat);
      });
      trials.forEach((trial, displayIndex) => {
        trial.displayIndex = displayIndex;
      });
      plan.trials = trials;
      plan.repeatTrialCount = repeatSources.length;
    }
    const reasonPool = [];
    for (const [evaluatorId, plan] of Object.entries(plans)) {
      for (const trial of plan.trials) {
        if (trial.repeatOf) continue;
        const draw = stringHash([seed, evaluatorId, trial.pairId, trial.trialIndex, STUDY_VERSION].join("::")) / 4294967296;
        trial.reasonDraw = draw;
        trial.reasonAlgoVersion = "class-hash-v1";
        reasonPool.push(trial);
      }
    }
    reasonPool.sort((a, b) => a.reasonDraw - b.reasonDraw || compareText(a.trialId, b.trialId));
    const reasonTarget = Math.round(reasonPool.length * requestedReasonRate);
    reasonPool.forEach((trial, index) => {
      trial.reasonPrompted = index < reasonTarget;
    });
    for (const plan of Object.values(plans)) {
      plan.reasonRateNominal = requestedReasonRate;
      plan.reasonPromptCount = plan.trials.filter((trial) => !trial.repeatOf && trial.reasonPrompted).length;
      plan.assignmentHash = hexHash({
        version: plan.version,
        algorithmVersion: plan.algorithmVersion,
        rosterVersion: plan.rosterVersion,
        contextByWork: plan.contextByWork,
        trials: plan.trials
      });
    }
    const validationErrors = validateAssignments({ works: cleanWorks, plans });
    if (validationErrors.length) throw new Error("\uBC30\uC815 \uAC80\uC99D \uC2E4\uD328: " + validationErrors.join(" / "));
    return plans;
  }
  function ratingWorkPlan(plan, count = PAIRWISE_DEFAULTS.ratingWorks) {
    const trials = (plan && plan.trials || []).filter((trial) => !trial.repeatOf);
    const seen = /* @__PURE__ */ new Map();
    for (const trial of trials) {
      if (!seen.has(trial.leftWorkId)) seen.set(trial.leftWorkId, (plan.contextByWork || {})[trial.leftWorkId] || trial.context);
      if (!seen.has(trial.rightWorkId)) seen.set(trial.rightWorkId, (plan.contextByWork || {})[trial.rightWorkId] || trial.context);
    }
    const ordered = [...seen.entries()].sort((a, b) => {
      const ah = stringHash(String(plan && plan.rosterVersion) + "::" + String(plan && plan.evaluatorId) + "::" + a[0]);
      const bh = stringHash(String(plan && plan.rosterVersion) + "::" + String(plan && plan.evaluatorId) + "::" + b[0]);
      return ah - bh;
    });
    return ordered.slice(0, Math.min(count, ordered.length)).map(([workId, context], index) => ({
      ratingIndex: index,
      workId,
      context
    }));
  }
  function preSurveyComplete(answers) {
    const source = answers || {};
    return PRE_SURVEY_ITEMS.every((item) => {
      const value = Number(source[item.id]);
      if (!Number.isFinite(value)) return false;
      if (item.options) return value >= 1 && value <= item.options.length;
      return value >= item.scale.min && value <= item.scale.max;
    });
  }
  function selfAssessmentComplete(assessment, { requireChangeReason = false } = {}) {
    const source = assessment || {};
    const scores = source.scores || {};
    const scoresComplete = SELF_ASSESSMENT_ITEMS.every((item) => {
      const value = Number(scores[item.id]);
      return Number.isInteger(value) && value >= 1 && value <= SELF_SCORE_LABELS.length;
    });
    if (!scoresComplete || String(source.evidence || "").trim().length < 15) return false;
    if (requireChangeReason) {
      const reasonCode = String(source.changeReasonCode || "");
      if (!SELF_CHANGE_REASON_OPTIONS.some((option) => option.value === reasonCode)) return false;
      if (reasonCode !== "unclear" && String(source.changeReason || "").trim().length < 8) return false;
    }
    return true;
  }
  function classifySelfChange(beforeScores, afterScores) {
    const deltaByItem = Object.fromEntries(SELF_ASSESSMENT_ITEMS.map((item) => {
      const before = Number(beforeScores && beforeScores[item.id]);
      const after = Number(afterScores && afterScores[item.id]);
      return [item.id, Number.isFinite(before) && Number.isFinite(after) ? after - before : null];
    }));
    const deltas = Object.values(deltaByItem).filter(Number.isFinite);
    let deltaClass = "unavailable";
    if (deltas.length === SELF_ASSESSMENT_ITEMS.length) {
      const positive = deltas.some((value) => value > 0);
      const negative = deltas.some((value) => value < 0);
      deltaClass = positive && negative ? "mixed" : positive ? "higher" : negative ? "lower" : "same";
    }
    return { deltaByItem, deltaClass };
  }
  function validateAssignments({ works, plans }) {
    const errors = [];
    const byId = /* @__PURE__ */ new Map();
    const ownerCount = /* @__PURE__ */ new Map();
    for (const [index, work] of (Array.isArray(works) ? works : []).entries()) {
      if (!work || typeof work !== "object") {
        errors.push(`\uC791\uD488 ${index + 1}: \uC790\uB8CC \uD615\uC2DD \uC624\uB958`);
        continue;
      }
      const id = normalizedId(work.id);
      const ownerId = normalizedId(work.ownerId);
      if (!id) {
        errors.push(`\uC791\uD488 ${index + 1}: id \uC5C6\uC74C`);
        continue;
      }
      if (!ownerId) errors.push(`${id}: ownerId \uC5C6\uC74C`);
      if (byId.has(id)) errors.push(`\uC911\uBCF5 \uC791\uD488 id: ${id}`);
      else byId.set(id, { ...work, id, ownerId });
      if (ownerId) ownerCount.set(ownerId, countOf(ownerCount, ownerId) + 1);
    }
    const planEntries = Object.entries(plans || {});
    const evaluatorIds = new Set(planEntries.map(([id]) => normalizedId(id)));
    for (const [ownerId, count] of ownerCount) {
      if (count !== 1) errors.push(`${ownerId}: \uC790\uAE30 \uC791\uD488\uC774 ${count}\uC810 \uC5F0\uACB0\uB428`);
      if (!evaluatorIds.has(ownerId)) errors.push(`${ownerId}: \uC791\uD488 \uC18C\uC720\uC790\uC758 \uD3C9\uAC00 \uACC4\uD68D \uC5C6\uC74C`);
    }
    let requestedMainTotal = 0;
    const reasonRates = /* @__PURE__ */ new Set();
    for (const [evaluatorId, plan] of Object.entries(plans || {})) {
      const normalizedEvaluatorId = normalizedId(evaluatorId);
      if (countOf(ownerCount, normalizedEvaluatorId) !== 1) errors.push(`${normalizedEvaluatorId}: \uC790\uAE30 \uC791\uD488\uC774 \uC815\uD655\uD788 1\uC810\uC774 \uC544\uB2D8`);
      if (!plan || !Array.isArray(plan.trials)) {
        errors.push(evaluatorId + ": \uC2DC\uD589 \uBC30\uC5F4 \uC5C6\uC74C");
        continue;
      }
      if (normalizedId(plan.evaluatorId) !== normalizedEvaluatorId) errors.push(evaluatorId + ": \uACC4\uD68D\uC758 \uD3C9\uAC00\uC790 id \uBD88\uC77C\uCE58");
      const mainPairs = /* @__PURE__ */ new Set();
      const main = plan.trials.filter((trial) => !trial.repeatOf);
      const repeats = plan.trials.filter((trial) => trial.repeatOf);
      const mainContexts = { image_only: 0, image_context: 0 };
      const screenContexts = { image_only: 0, image_context: 0 };
      const trialIds = /* @__PURE__ */ new Set();
      const requestedMain = Number(plan.requestedMainTrialCount);
      const requestedRepeat = Number(plan.requestedRepeatTrialCount);
      if (!Number.isInteger(requestedMain) || requestedMain < 1) errors.push(evaluatorId + ": \uC694\uCCAD \uBCF8 \uBE44\uAD50 \uC218 \uC5C6\uC74C \uB610\uB294 \uC624\uB958");
      else {
        requestedMainTotal += requestedMain;
        if (main.length !== requestedMain) errors.push(evaluatorId + `: \uC694\uCCAD\uD55C \uBCF8 \uBE44\uAD50 ${requestedMain}\uD68C\uB97C \uCC44\uC6B0\uC9C0 \uBABB\uD568`);
      }
      if (!Number.isInteger(requestedRepeat) || requestedRepeat < 0) errors.push(evaluatorId + ": \uC694\uCCAD \uBC18\uBCF5 \uC218 \uC5C6\uC74C \uB610\uB294 \uC624\uB958");
      else if (repeats.length !== requestedRepeat) errors.push(evaluatorId + `: \uC694\uCCAD\uD55C \uBC18\uBCF5 ${requestedRepeat}\uD68C\uB97C \uCC44\uC6B0\uC9C0 \uBABB\uD568`);
      if (main.length !== plan.mainTrialCount) errors.push(evaluatorId + ": \uBCF8 \uBE44\uAD50 \uC218 \uBD88\uC77C\uCE58");
      if (repeats.length !== plan.repeatTrialCount) errors.push(evaluatorId + ": \uBC18\uBCF5 \uBE44\uAD50 \uC218 \uBD88\uC77C\uCE58");
      if (!Number.isInteger(plan.minRepeatGap) || plan.minRepeatGap < 0) errors.push(evaluatorId + ": \uBC18\uBCF5 \uAC04\uACA9 \uC124\uC815 \uC624\uB958");
      const nominalReasonRate = Number(plan.reasonRateNominal);
      if (!Number.isFinite(nominalReasonRate) || nominalReasonRate < 0 || nominalReasonRate > 1) errors.push(evaluatorId + ": \uC774\uC720 \uBB38\uD56D \uBE44\uC728 \uC624\uB958");
      else reasonRates.add(nominalReasonRate);
      plan.trials.forEach((trial, displayIndex) => {
        if (trial.displayIndex !== displayIndex) errors.push(evaluatorId + ": \uD654\uBA74 \uC21C\uC11C \uBC88\uD638 \uBD88\uC77C\uCE58");
        if (!trial || !trial.trialId) errors.push(evaluatorId + ": \uC2DC\uD589 id \uC5C6\uC74C");
        else if (trialIds.has(trial.trialId)) errors.push(evaluatorId + ": \uC2DC\uD589 id \uC911\uBCF5");
        else trialIds.add(trial.trialId);
        const leftId = normalizedId(trial && trial.leftWorkId);
        const rightId = normalizedId(trial && trial.rightWorkId);
        const left = byId.get(leftId);
        const right = byId.get(rightId);
        if (!left || !right) errors.push(evaluatorId + ": \uC874\uC7AC\uD558\uC9C0 \uC54A\uB294 \uC791\uD488");
        if (leftId === rightId) errors.push(evaluatorId + ": \uAC19\uC740 \uC791\uD488\uB07C\uB9AC \uBE44\uAD50");
        if (left && left.ownerId === normalizedEvaluatorId || right && right.ownerId === normalizedEvaluatorId) errors.push(evaluatorId + ": \uC790\uAE30 \uC791\uD488 \uD3EC\uD568");
        if (trial && pairKey(leftId, rightId) !== trial.pairId) errors.push(evaluatorId + ": pairId \uBD88\uC77C\uCE58");
        if (trial && screenContexts[trial.context] == null) errors.push(evaluatorId + ": \uC54C \uC218 \uC5C6\uB294 \uB9E5\uB77D \uC870\uAC74");
        else if (trial) screenContexts[trial.context] += 1;
        if (trial && ((plan.contextByWork || {})[leftId] !== trial.context || (plan.contextByWork || {})[rightId] !== trial.context)) {
          errors.push(evaluatorId + ": \uC791\uD488\uBCC4 \uB9E5\uB77D \uC870\uAC74 \uBD88\uC77C\uCE58");
        }
      });
      for (const trial of main) {
        if (mainPairs.has(trial.pairId)) errors.push(evaluatorId + ": \uBCF8 \uBE44\uAD50 \uC30D \uC911\uBCF5");
        mainPairs.add(trial.pairId);
        if (mainContexts[trial.context] != null) mainContexts[trial.context] += 1;
      }
      if (Math.abs(mainContexts.image_only - mainContexts.image_context) > 1) errors.push(evaluatorId + ": \uBCF8 \uBE44\uAD50 \uB9E5\uB77D \uC870\uAC74 \uBD88\uADE0\uD615");
      if (Math.abs(screenContexts.image_only - screenContexts.image_context) > 1) errors.push(evaluatorId + ": \uBC18\uBCF5 \uD3EC\uD568 \uB9E5\uB77D \uC870\uAC74 \uBD88\uADE0\uD615");
      const originals = new Map(main.map((trial) => [trial.trialId, trial]));
      const repeatedSources = /* @__PURE__ */ new Set();
      for (const repeat of repeats) {
        const original = originals.get(repeat.repeatOf);
        if (!original) errors.push(evaluatorId + ": \uBC18\uBCF5 \uC6D0\uBCF8 \uC5C6\uC74C");
        else {
          if (repeatedSources.has(original.trialId)) errors.push(evaluatorId + ": \uAC19\uC740 \uC6D0\uBCF8\uC744 \uB450 \uBC88 \uBC18\uBCF5");
          repeatedSources.add(original.trialId);
          if (repeat.leftWorkId !== original.rightWorkId || repeat.rightWorkId !== original.leftWorkId) errors.push(evaluatorId + ": \uBC18\uBCF5 \uC30D \uC88C\uC6B0 \uBBF8\uBC18\uC804");
          if (repeat.context !== original.context) errors.push(evaluatorId + ": \uBC18\uBCF5 \uC30D \uB9E5\uB77D \uBCC0\uACBD");
          if (repeat.pairId !== original.pairId) errors.push(evaluatorId + ": \uBC18\uBCF5 pairId \uBCC0\uACBD");
          if (repeat.reasonPrompted) errors.push(evaluatorId + ": \uBC18\uBCF5 \uC2DC\uD589\uC5D0 \uC774\uC720 \uBB38\uD56D \uD45C\uC2DC");
          const sourcePosition = plan.trials.indexOf(original);
          const repeatPosition = plan.trials.indexOf(repeat);
          if (repeatPosition <= sourcePosition) errors.push(evaluatorId + ": \uBC18\uBCF5\uC774 \uC6D0\uBCF8\uBCF4\uB2E4 \uBA3C\uC800 \uC81C\uC2DC\uB428");
          if (repeatPosition - sourcePosition - 1 < plan.minRepeatGap) errors.push(evaluatorId + ": \uBC18\uBCF5 \uC0AC\uC774 \uD654\uBA74 \uC218 \uBD80\uC871");
        }
      }
    }
    const diagnostics = summarizeAssignments({ works, plans });
    if (!diagnostics.mainTrials) errors.push("\uD559\uAE09 \uBCF8 \uBE44\uAD50\uAC00 0\uD68C\uC784");
    if (diagnostics.mainTrials !== requestedMainTotal) errors.push("\uD559\uAE09 \uC694\uCCAD \uBCF8 \uBE44\uAD50 \uD569\uACC4 \uBD88\uC77C\uCE58");
    if (diagnostics.works > 1 && diagnostics.connectedComponents !== 1) errors.push("\uD559\uAE09 \uBE44\uAD50 \uADF8\uB798\uD504\uAC00 " + diagnostics.connectedComponents + "\uAC1C\uB85C \uB04A\uC5B4\uC9D0");
    if (Math.abs(diagnostics.mainContexts.image_only - diagnostics.mainContexts.image_context) > 1) errors.push("\uD559\uAE09 \uBCF8 \uBE44\uAD50 \uB9E5\uB77D \uC870\uAC74 \uBD88\uADE0\uD615");
    if (Math.abs(diagnostics.contexts.image_only - diagnostics.contexts.image_context) > 1) errors.push("\uD559\uAE09 \uBC18\uBCF5 \uD3EC\uD568 \uB9E5\uB77D \uC870\uAC74 \uBD88\uADE0\uD615");
    if (diagnostics.maxPositionImbalance > 1) errors.push("\uD559\uAE09 \uBC18\uBCF5 \uD3EC\uD568 \uC88C\uC6B0 \uC704\uCE58 \uBD88\uADE0\uD615");
    if (reasonRates.size > 1) errors.push("\uACC4\uD68D\uBCC4 \uC774\uC720 \uBB38\uD56D \uBE44\uC728 \uBD88\uC77C\uCE58");
    if (diagnostics.reasonPromptCount !== Math.round(diagnostics.mainTrials * diagnostics.reasonRateNominal)) errors.push("\uD559\uAE09 \uC774\uC720 \uBB38\uD56D \uD45C\uC9D1 \uC218 \uBD88\uC77C\uCE58");
    return errors;
  }
  function summarizeAssignments({ works, plans }) {
    const workIds = [...new Set((works || []).map((work) => normalizedId(work && work.id)).filter(Boolean))].sort(compareText);
    const exposure = Object.fromEntries(workIds.map((id) => [id, 0]));
    const left = Object.fromEntries(workIds.map((id) => [id, 0]));
    const right = Object.fromEntries(workIds.map((id) => [id, 0]));
    const contexts = { image_only: 0, image_context: 0 };
    const mainExposure = Object.fromEntries(workIds.map((id) => [id, 0]));
    const mainLeft = Object.fromEntries(workIds.map((id) => [id, 0]));
    const mainRight = Object.fromEntries(workIds.map((id) => [id, 0]));
    const mainContexts = { image_only: 0, image_context: 0 };
    const pairUse = {};
    const adjacency = new Map(workIds.map((id) => [id, /* @__PURE__ */ new Set()]));
    let screenTrials = 0;
    let mainTrials = 0;
    let repeatTrials = 0;
    let reasonPromptCount = 0;
    let reasonRateNominal = null;
    for (const plan of Object.values(plans || {})) {
      if (reasonRateNominal == null && Number.isFinite(Number(plan.reasonRateNominal))) reasonRateNominal = Number(plan.reasonRateNominal);
      for (const trial of plan.trials || []) {
        screenTrials += 1;
        if (exposure[trial.leftWorkId] != null) exposure[trial.leftWorkId] += 1;
        if (exposure[trial.rightWorkId] != null) exposure[trial.rightWorkId] += 1;
        if (left[trial.leftWorkId] != null) left[trial.leftWorkId] += 1;
        if (right[trial.rightWorkId] != null) right[trial.rightWorkId] += 1;
        if (contexts[trial.context] != null) contexts[trial.context] += 1;
        if (trial.repeatOf) {
          repeatTrials += 1;
          continue;
        }
        mainTrials += 1;
        if (trial.reasonPrompted) reasonPromptCount += 1;
        if (mainExposure[trial.leftWorkId] != null) mainExposure[trial.leftWorkId] += 1;
        if (mainExposure[trial.rightWorkId] != null) mainExposure[trial.rightWorkId] += 1;
        if (mainLeft[trial.leftWorkId] != null) mainLeft[trial.leftWorkId] += 1;
        if (mainRight[trial.rightWorkId] != null) mainRight[trial.rightWorkId] += 1;
        if (mainContexts[trial.context] != null) mainContexts[trial.context] += 1;
        pairUse[trial.pairId] = (pairUse[trial.pairId] || 0) + 1;
        if (adjacency.has(trial.leftWorkId) && adjacency.has(trial.rightWorkId)) {
          adjacency.get(trial.leftWorkId).add(trial.rightWorkId);
          adjacency.get(trial.rightWorkId).add(trial.leftWorkId);
        }
      }
    }
    let connectedComponents = 0;
    const unseen = new Set(workIds.filter((id) => mainExposure[id] > 0));
    while (unseen.size) {
      connectedComponents += 1;
      const stack = [unseen.values().next().value];
      while (stack.length) {
        const id = stack.pop();
        if (!unseen.delete(id)) continue;
        for (const next of adjacency.get(id) || []) if (unseen.has(next)) stack.push(next);
      }
    }
    connectedComponents += workIds.filter((id) => mainExposure[id] === 0).length;
    const exposureValues = Object.values(exposure);
    const mainExposureValues = Object.values(mainExposure);
    const positionImbalance = Object.fromEntries(workIds.map((id) => [id, Math.abs(left[id] - right[id])]));
    const mainPositionImbalance = Object.fromEntries(workIds.map((id) => [id, Math.abs(mainLeft[id] - mainRight[id])]));
    return {
      evaluators: Object.keys(plans || {}).length,
      works: workIds.length,
      screenTrials,
      mainTrials,
      repeatTrials,
      reasonPromptCount,
      reasonRateNominal: reasonRateNominal == null ? 0 : reasonRateNominal,
      reasonRateActual: mainTrials ? reasonPromptCount / mainTrials : 0,
      exposure,
      exposureRange: exposureValues.length ? Math.max(...exposureValues) - Math.min(...exposureValues) : 0,
      left,
      right,
      positionImbalance,
      maxPositionImbalance: Math.max(0, ...Object.values(positionImbalance)),
      contexts,
      mainExposure,
      mainExposureRange: mainExposureValues.length ? Math.max(...mainExposureValues) - Math.min(...mainExposureValues) : 0,
      mainLeft,
      mainRight,
      mainPositionImbalance,
      maxMainPositionImbalance: Math.max(0, ...Object.values(mainPositionImbalance)),
      mainContexts,
      pairUse,
      connectedComponents
    };
  }
  function emptyStudyRecord({
    evaluatorCode,
    rosterVersion,
    assignmentHash = null,
    configHash = null,
    sessionId = null,
    buildCommit = null,
    deviceStart = null
  } = {}) {
    return {
      studyVersion: STUDY_VERSION,
      protocolVersion: STUDY_VERSION,
      buildCommit,
      configHash,
      assignmentHash,
      sessionId,
      evaluatorCode,
      rosterVersion,
      contextAssignmentUnit: "evaluator_work",
      status: "pre",
      startedAtClient: null,
      resumedCount: 0,
      deviceStart,
      trialOrder: [],
      aiRatingOrder: [],
      events: [],
      pre: { answers: {}, startedAt: null, submittedAt: null, durationMs: null },
      selfAssessment: {
        ownWorkId: null,
        rubricVersion: SELF_ASSESSMENT_VERSION,
        scaleVersion: "self-score-5-v1",
        before: { scores: {}, evidence: "", startedAt: null, submittedAt: null },
        after: {
          scores: {},
          evidence: "",
          currentLockedAt: null,
          changeReasonCode: null,
          changeReason: "",
          changeReasonAt: null,
          deltaByItem: null,
          deltaClass: null,
          deltaCalculatedAt: null,
          startedAt: null,
          submittedAt: null
        }
      },
      pairwise: { startedAt: null, submittedAt: null, trials: [] },
      aiRatings: { startedAt: null, submittedAt: null, items: [] }
    };
  }

  // pairwise-research/prototype.mjs
  var STORAGE_KEY = "museum.pairwiseResearch.prototype.r2";
  var EVALUATOR_ID = "S01";
  var ROSTER_VERSION = "prototype-class-2026-08-r2";
  var nowIso = () => (/* @__PURE__ */ new Date()).toISOString();
  var escapeHtml = (value) => String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  function artSvg(index) {
    const palettes = [
      ["#d7c3aa", "#6f5845", "#f3eee7"],
      ["#bdcbc7", "#315b5c", "#eef3f1"],
      ["#c6c0d3", "#514a6b", "#f0eef5"],
      ["#d8b9ae", "#7b403a", "#f6ece8"]
    ];
    const [base, ink, paper] = palettes[index % palettes.length];
    const n = index + 1;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
    <rect width="800" height="600" fill="${paper}"/>
    <rect x="34" y="34" width="732" height="532" fill="${base}" opacity=".34"/>
    <ellipse cx="400" cy="492" rx="225" ry="38" fill="#000" opacity=".12"/>
    <path d="M${210 + n * 3} 430 C245 335 265 205 355 165 C430 132 565 207 585 325 C598 407 530 455 420 462 C330 468 250 458 ${210 + n * 3} 430Z" fill="${ink}" opacity=".92"/>
    <path d="M300 392 C350 ${250 + n * 4} 470 ${238 - n * 2} 536 348" fill="none" stroke="${paper}" stroke-width="${18 + n % 4 * 5}" opacity=".75"/>
    <circle cx="${310 + n * 29 % 250}" cy="${250 + n * 17 % 120}" r="${30 + n % 5 * 8}" fill="${base}" stroke="${paper}" stroke-width="8"/>
    <path d="M165 510 H635" stroke="${ink}" stroke-width="4"/><path d="M190 494 V526 M610 494 V526" stroke="${ink}" stroke-width="4"/>
    <text x="400" y="552" text-anchor="middle" font-family="monospace" font-size="16" fill="${ink}">ARCHIVE OBJECT ${String(n).padStart(2, "0")}</text>
  </svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }
  var DEMO_WORKS = Array.from({ length: 14 }, (_, i) => ({
    id: "W" + String(i + 1).padStart(2, "0"),
    ownerId: "S" + String(i + 1).padStart(2, "0"),
    title: ["\uB0A8\uC740 \uC190\uC7A1\uC774", "\uC218\uC704\uC120", "\uC5F4\uC1E0 37", "\uB9C8\uC9C0\uB9C9 \uC2DD\uD310", "\uC57C\uAC04\uB4F1", "\uBE48 \uD45C\uC9C0", "\uB20C\uB9B0 \uB2E8\uCD94"][i % 7] + " " + (i + 1),
    relic: ["\uB9C8\uBAA8\uB41C \uC6B4\uBC18 \uAE30\uAD6C \uD30C\uD3B8", "\uB3C4\uC7A5 \uBC15\uB9AC \uC218\uB0A9\uD568 \uC870\uAC01", "\uBC88\uD638\uD45C\uAC00 \uB2EC\uB9B0 \uC5F4\uC1E0", "\uC720\uC57D\uC774 \uAC08\uB77C\uC9C4 \uC2DD\uD310", "\uBE5B\uC774 \uC0C8\uB294 \uD45C\uC2DC \uC7A5\uCE58"][i % 5],
    statement: [
      "\uBC18\uBCF5\uB418\uC5C8\uC9C0\uB9CC \uAE30\uB85D\uB418\uC9C0 \uC54A\uC740 \uB178\uB3D9\uC758 \uD754\uC801\uC744, \uC190\uC774 \uB2FF\uB294 \uD55C \uC9C0\uC810\uC758 \uB9C8\uBAA8\uB85C \uB4DC\uB7EC\uB0B8\uB2E4.",
      "\uB9E4\uB144 \uAC19\uC740 \uB192\uC774\uAE4C\uC9C0 \uCC28\uC624\uB978 \uBB3C\uC774 \uC0AC\uBB3C \uD45C\uBA74\uC5D0 \uB0A8\uAE34 \uC120\uC744 \uBBF8\uB798\uC758 \uBC1C\uAD74 \uAE30\uB85D\uCC98\uB7FC \uC81C\uC2DC\uD55C\uB2E4.",
      "\uC0AC\uB77C\uC9C4 \uC7A5\uC18C\uB97C \uC0AC\uB78C\uC758 \uC5BC\uAD74 \uB300\uC2E0 \uC624\uB798 \uC0AC\uC6A9\uD55C \uBB3C\uAC74\uC758 \uBC88\uD638\uC640 \uC190\uC0C1\uC73C\uB85C \uAE30\uC5B5\uD55C\uB2E4.",
      "\uC77C\uC0C1\uC5D0\uC11C \uB108\uBB34 \uC775\uC219\uD574 \uBCF4\uC774\uC9C0 \uC54A\uB358 \uBB38\uC81C\uB97C \uC218\uC9D1\xB7\uBD84\uB958\xB7\uBA85\uBA85\uD558\uB294 \uC804\uC2DC \uC7A5\uCE58\uB85C \uB2E4\uC2DC \uBCF4\uC774\uAC8C \uD55C\uB2E4."
    ][i % 4],
    contextVersion: "demo-context-v1",
    image: artSvg(i)
  }));
  var DEMO_EVALUATORS = DEMO_WORKS.map((work) => work.ownerId);
  var PLANS = makeClassAssignments({ works: DEMO_WORKS, evaluators: DEMO_EVALUATORS, k: PAIRWISE_DEFAULTS.mainTrials, seed: ROSTER_VERSION });
  var PLAN = PLANS[EVALUATOR_ID];
  var RATING_PLAN = ratingWorkPlan(PLAN, 6);
  var WORK_BY_ID = new Map(DEMO_WORKS.map((work) => [work.id, work]));
  var OWN_WORK = DEMO_WORKS.find((work) => work.ownerId === EVALUATOR_ID);
  function loadRecord() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (saved && saved.studyVersion === STUDY_VERSION && saved.assignmentHash === PLAN.assignmentHash) {
        saved.resumedCount = (saved.resumedCount || 0) + 1;
        return saved;
      }
    } catch (_) {
    }
    const record2 = emptyStudyRecord({
      evaluatorCode: "P-DEMO-01",
      rosterVersion: ROSTER_VERSION,
      assignmentHash: PLAN.assignmentHash,
      configHash: "prototype-config-r2",
      sessionId: "preview-" + Date.now().toString(36),
      deviceStart: deviceSnapshot()
    });
    record2.prototypeMode = true;
    record2.selfAssessment.ownWorkId = OWN_WORK.id;
    record2.trialOrder = PLAN.trials.map((trial) => trial.trialId);
    record2.aiRatingOrder = RATING_PLAN.map((item) => item.workId);
    record2.startedAtClient = nowIso();
    return record2;
  }
  var record = loadRecord();
  var requestedStage = new URLSearchParams(location.search).get("stage");
  var _a, _b, _c, _d;
  if (["pre", "selfBefore", "intro", "pair", "selfAfter", "aiIntro", "ai", "done"].includes(requestedStage)) {
    record.status = requestedStage;
    record.prototypeNavigation = true;
    if (requestedStage === "selfBefore") (_a = record.selfAssessment.before).startedAt || (_a.startedAt = nowIso());
    if (requestedStage === "pair") (_b = record.pairwise).startedAt || (_b.startedAt = nowIso());
    if (requestedStage === "selfAfter") (_c = record.selfAssessment.after).startedAt || (_c.startedAt = nowIso());
    if (requestedStage === "ai") (_d = record.aiRatings).startedAt || (_d.startedAt = nowIso());
  }
  var observer = null;
  var resizeTimer = null;
  function saveRecord() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    const status = document.querySelector("#save-status");
    if (status) status.textContent = "\uC774 \uAE30\uAE30\uC758 \uBBF8\uB9AC\uBCF4\uAE30 \uC800\uC7A5\uC18C\uC5D0 \uC800\uC7A5\uB428 \xB7 " + (/* @__PURE__ */ new Date()).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  function addEvent(type, payload = {}) {
    record.events = [...record.events || [], { type, at: nowIso(), ...payload }].slice(-1200);
  }
  function deviceSnapshot() {
    const vv = window.visualViewport;
    return {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      visualViewportWidth: vv ? Math.round(vv.width) : null,
      visualViewportHeight: vv ? Math.round(vv.height) : null,
      orientation: screen.orientation ? screen.orientation.type : window.innerWidth >= window.innerHeight ? "landscape" : "portrait",
      devicePixelRatio: window.devicePixelRatio || 1,
      pointer: matchMedia("(pointer: coarse)").matches ? "coarse" : "fine"
    };
  }
  function layoutSnapshot(trial) {
    const axis = matchMedia("(max-width: 720px)").matches ? "y" : "x";
    const first = document.querySelector(`[data-work-id="${trial.leftWorkId}"]`);
    const second = document.querySelector(`[data-work-id="${trial.rightWorkId}"]`);
    const rect = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    };
    return {
      axis,
      firstPhysical: axis === "x" ? "left" : "top",
      secondPhysical: axis === "x" ? "right" : "bottom",
      firstRect: rect(first),
      secondRect: rect(second),
      scrollY: Math.round(window.scrollY),
      ...deviceSnapshot()
    };
  }
  function shell(content, { step = "", title = "\uC30D\uB300\uBE44\uAD50 \uC5F0\uAD6C \uD654\uBA74" } = {}) {
    return `
    <header class="topbar">
      <div><span class="eyebrow">ISOLATED PROTOTYPE</span><strong>${escapeHtml(title)}</strong></div>
      <span id="save-status" role="status">\uAE30\uC874 \uC571\uACFC \uC5F0\uACB0\uB418\uC9C0 \uC54A\uC740 \uAC80\uD1A0\uC6A9 \uD654\uBA74</span>
    </header>
    <aside class="preview-tools" aria-label="\uD504\uB85C\uD1A0\uD0C0\uC785 \uB2E8\uACC4 \uC774\uB3D9">
      <b>\uAC80\uD1A0 \uB3C4\uAD6C</b><span>\uC2E4\uC81C \uD559\uC0DD \uD654\uBA74\uC5D0\uB294 \uD45C\uC2DC\uD558\uC9C0 \uC54A\uC74C</span>
      <button data-preview-stage="pre">\uC0AC\uC804\uC124\uBB38</button>
      <button data-preview-stage="selfBefore">\uC790\uAE30\uD3C9\uAC00\u2460</button>
      <button data-preview-stage="intro">\uBE44\uAD50 \uC548\uB0B4</button>
      <button data-preview-stage="selfAfter">\uC790\uAE30\uD3C9\uAC00\u2461</button>
      <button data-preview-stage="aiIntro">AI\uB2E4\uC6C0</button>
      <button data-preview-stage="done">\uC644\uB8CC</button>
      <button data-preview-reset class="subtle">\uCD08\uAE30\uD654</button>
    </aside>
    <main id="main" tabindex="-1">
      ${step ? `<div class="step-label">${escapeHtml(step)}</div>` : ""}
      ${content}
    </main>
  `;
  }
  function setHtml(html, focusSelector = "#main") {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    document.querySelector("#app").innerHTML = html;
    bindPreviewTools();
    requestAnimationFrame(() => {
      const target = document.querySelector(focusSelector);
      if (target) target.focus({ preventScroll: true });
    });
  }
  function bindPreviewTools() {
    document.querySelectorAll("[data-preview-stage]").forEach((button) => {
      button.addEventListener("click", () => {
        var _a2, _b2;
        record.status = button.dataset.previewStage;
        record.prototypeNavigation = true;
        if (record.status === "selfBefore") (_a2 = record.selfAssessment.before).startedAt || (_a2.startedAt = nowIso());
        if (record.status === "selfAfter") (_b2 = record.selfAssessment.after).startedAt || (_b2.startedAt = nowIso());
        if (record.status === "aiIntro" && !record.pairwise.submittedAt) record.pairwise.submittedAt = nowIso();
        addEvent("prototype_jump", { stage: record.status });
        saveRecord();
        render();
      });
    });
    const reset = document.querySelector("[data-preview-reset]");
    if (reset) reset.addEventListener("click", () => {
      if (!confirm("\uC774 \uB3C5\uB9BD \uD504\uB85C\uD1A0\uD0C0\uC785\uC758 \uBE0C\uB77C\uC6B0\uC800 \uC800\uC7A5 \uB0B4\uC6A9\uB9CC \uCD08\uAE30\uD654\uD560\uAE4C\uC694?")) return;
      localStorage.removeItem(STORAGE_KEY);
      record = loadRecord();
      render();
    });
  }
  function optionButtons(item, value) {
    const namedScale = !item.options && Array.isArray(item.scale && item.scale.labels);
    const options = item.options || (namedScale ? item.scale.labels : Array.from({ length: item.scale.max - item.scale.min + 1 }, (_, i) => String(item.scale.min + i)));
    return `<div class="answer-options ${item.scale && item.scale.max === 10 ? "ten" : ""} ${namedScale ? "named" : ""}" role="radiogroup" aria-label="${escapeHtml(item.text)}">
    ${options.map((label, i) => {
      const n = item.options ? i + 1 : item.scale.min + i;
      const endpoint = !item.options && (i === 0 ? item.scale.low : i === options.length - 1 ? item.scale.high : "");
      return `<button type="button" role="radio" aria-checked="${Number(value) === n}" class="${Number(value) === n ? "selected" : ""}"
        tabindex="${Number(value) === n || !(Number(value) > 0) && i === 0 ? "0" : "-1"}"
        data-pre-item="${item.id}" data-value="${n}" title="${escapeHtml(item.options || namedScale ? label : endpoint || n + "\uC810")}">
        <b>${item.options || namedScale ? escapeHtml(label) : n}</b>${!namedScale && endpoint ? `<small>${escapeHtml(endpoint)}</small>` : ""}
      </button>`;
    }).join("")}
  </div>`;
  }
  function bindRadioArrowKeys(groupSelector) {
    document.querySelectorAll(groupSelector).forEach((group) => {
      const buttons = [...group.querySelectorAll('[role="radio"]')];
      buttons.forEach((button, index) => button.addEventListener("keydown", (event) => {
        let nextIndex = null;
        if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % buttons.length;
        else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + buttons.length) % buttons.length;
        else if (event.key === "Home") nextIndex = 0;
        else if (event.key === "End") nextIndex = buttons.length - 1;
        if (nextIndex == null) return;
        event.preventDefault();
        buttons[nextIndex].click();
      }));
    });
  }
  function renderPre() {
    const answers = record.pre.answers || {};
    const answered = PRE_SURVEY_ITEMS.filter((item) => Number(answers[item.id]) > 0).length;
    const groups = PRE_SURVEY_GROUPS.map((group, groupIndex) => `
    <section class="survey-group" aria-labelledby="group-${group.id}">
      <h2 id="group-${group.id}">${groupIndex + 1}. ${escapeHtml(group.title)}</h2>
      <p class="help">${escapeHtml(group.note)}</p>
      ${group.items.map((base) => {
      const item = PRE_SURVEY_ITEMS.find((candidate) => candidate.id === base.id);
      const number = PRE_SURVEY_ITEMS.findIndex((candidate) => candidate.id === item.id) + 1;
      return `<fieldset class="survey-item" id="pre-${item.id}">
          <legend><span>${String(number).padStart(2, "0")}</span>${escapeHtml(item.text)}</legend>
          ${item.help ? `<p class="item-help">${escapeHtml(item.help)}</p>` : ""}
          ${optionButtons(item, answers[item.id])}
        </fieldset>`;
    }).join("")}
    </section>
  `).join("");
    setHtml(shell(`
    <section class="hero compact">
      <span class="eyebrow">\uB2E8\uC6D0 \uC2DC\uC791 \uC804 \xB7 \uC57D 6\uBD84</span>
      <h1 tabindex="-1">\uBBF8\uC220\uACFC \uC774\uBBF8\uC9C0 AI \uC0AC\uC6A9 \uACBD\uD5D8</h1>
      <p>\uC131\uC801\uACFC \uAD00\uACC4\uC5C6\uC73C\uBA70 \uC815\uB2F5\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uC9C0\uAE08\uAE4C\uC9C0\uC758 \uACBD\uD5D8\uACFC \uD604\uC7AC \uC0DD\uAC01\uC5D0 \uAC00\uC7A5 \uAC00\uAE4C\uC6B4 \uB2F5\uC744 \uACE8\uB77C \uC8FC\uC138\uC694.</p>
    </section>
    <div class="progress-box" aria-label="\uC124\uBB38 \uC9C4\uD589\uB960"><span><i style="width:${answered / PRE_SURVEY_ITEMS.length * 100}%"></i></span><b>${answered}/${PRE_SURVEY_ITEMS.length}</b></div>
    <form id="pre-form" novalidate>${groups}
      <div class="action-bar"><button class="primary" type="submit">\uC0AC\uC804\uC124\uBB38 \uC81C\uCD9C</button><span>\uBAA8\uB4E0 \uBB38\uD56D\uC5D0 \uB2F5\uD574\uC57C \uC81C\uCD9C\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</span></div>
    </form>
  `, { step: "1 / 6 \xB7 \uC0AC\uC804\uC124\uBB38", title: "\uBBF8\uC220\uACFC \uC774\uBBF8\uC9C0 AI \uC0AC\uC6A9 \uACBD\uD5D8" }), "h1");
    document.querySelectorAll("[data-pre-item]").forEach((button) => button.addEventListener("click", () => {
      var _a2;
      (_a2 = record.pre).startedAt || (_a2.startedAt = nowIso());
      record.pre.answers[button.dataset.preItem] = Number(button.dataset.value);
      addEvent("pre_answer", { itemId: button.dataset.preItem, value: Number(button.dataset.value) });
      saveRecord();
      renderPre();
      requestAnimationFrame(() => {
        const selected = document.querySelector(`[data-pre-item="${button.dataset.preItem}"][data-value="${button.dataset.value}"]`);
        if (selected) selected.focus({ preventScroll: true });
      });
    }));
    bindRadioArrowKeys(".answer-options");
    document.querySelector("#pre-form").addEventListener("submit", (event) => {
      var _a2;
      event.preventDefault();
      if (!preSurveyComplete(record.pre.answers)) {
        const missing = PRE_SURVEY_ITEMS.find((item) => !(Number(record.pre.answers[item.id]) > 0));
        const field = missing && document.querySelector("#pre-" + missing.id);
        if (field) {
          field.classList.add("error");
          field.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        announce("\uC544\uC9C1 \uB2F5\uD558\uC9C0 \uC54A\uC740 \uBB38\uD56D\uC774 \uC788\uC2B5\uB2C8\uB2E4.", true);
        return;
      }
      record.pre.submittedAt = nowIso();
      record.pre.durationMs = record.pre.startedAt ? Date.now() - new Date(record.pre.startedAt).getTime() : null;
      record.status = "selfBefore";
      (_a2 = record.selfAssessment.before).startedAt || (_a2.startedAt = nowIso());
      addEvent("pre_submit");
      saveRecord();
      render();
    });
  }
  function selfWorkCard() {
    return `<div class="single-work self-work">
    <span class="eyebrow">\uB0B4\uAC00 \uC81C\uCD9C\uD55C \uCD5C\uC885 \uC791\uD488</span>
    <img src="${OWN_WORK.image}" alt="\uB0B4\uAC00 \uC81C\uCD9C\uD55C \uCD5C\uC885 \uC791\uD488" />
    <div class="work-context"><b>\u300C${escapeHtml(OWN_WORK.title)}\u300D</b><small>${escapeHtml(OWN_WORK.relic)}</small><p>${escapeHtml(OWN_WORK.statement)}</p></div>
  </div>`;
  }
  function selfScoreRows(assessment, phase) {
    return SELF_ASSESSMENT_ITEMS.map((item, index) => `<fieldset class="survey-item self-score-item" id="self-${phase}-${item.id}">
    <legend><span>${String(index + 1).padStart(2, "0")}</span><b>${escapeHtml(item.label)}</b> \xB7 ${escapeHtml(item.text)}</legend>
    <div class="answer-options self-score-options named" role="radiogroup" aria-label="${escapeHtml(item.label)} \uC790\uAE30\uD3C9\uAC00">
      ${SELF_SCORE_LABELS.map((label, scoreIndex) => {
      const score = scoreIndex + 1;
      const selected = Number(assessment.scores[item.id]) === score;
      return `<button type="button" role="radio" aria-checked="${selected}" tabindex="${selected || !assessment.scores[item.id] && scoreIndex === 0 ? "0" : "-1"}" class="${selected ? "selected" : ""}" data-self-phase="${phase}" data-self-item="${item.id}" data-value="${score}"><b>${score}</b><small>${escapeHtml(label)}</small></button>`;
    }).join("")}
    </div>
  </fieldset>`).join("");
  }
  function bindSelfScoreForm(phase, renderAgain) {
    const assessment = phase === "before" ? record.selfAssessment.before : record.selfAssessment.after;
    document.querySelectorAll("[data-self-item]").forEach((button) => button.addEventListener("click", () => {
      const itemId = button.dataset.selfItem;
      const value = Number(button.dataset.value);
      assessment.startedAt || (assessment.startedAt = nowIso());
      assessment.scores[itemId] = value;
      addEvent("self_score", { phase, itemId, value });
      saveRecord();
      renderAgain();
      requestAnimationFrame(() => document.querySelector(`[data-self-phase="${phase}"][data-self-item="${itemId}"][data-value="${value}"]`)?.focus({ preventScroll: true }));
    }));
    bindRadioArrowKeys(".self-score-options");
    const evidence = document.querySelector("#self-evidence");
    if (evidence) evidence.addEventListener("input", () => {
      assessment.evidence = evidence.value;
      saveRecord();
      const submit = document.querySelector("#self-submit");
      if (submit) submit.disabled = !selfAssessmentComplete(assessment);
      const count = document.querySelector("#self-evidence-count");
      if (count) count.textContent = assessment.evidence.trim().length + "/300 \xB7 \uCD5C\uC18C 15\uC790";
    });
  }
  function renderSelfBefore() {
    const assessment = record.selfAssessment.before;
    if (assessment.submittedAt) {
      setHtml(shell(`
      <section class="hero compact">
        <span class="eyebrow">\uC790\uAE30\uD3C9\uAC00 \u2460 \uD655\uC815 \uC644\uB8CC</span>
        <h1 tabindex="-1">\uCC98\uC74C \uC790\uAE30\uD3C9\uAC00\uB294 \uC218\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4</h1>
        <p>\uC774\uC804 \uD310\uB2E8\uC774 \uB4A4\uC758 \uBE44\uAD50\uC640 \uC7AC\uCC44\uC810\uC5D0 \uB9DE\uCDB0 \uBC14\uB00C\uC9C0 \uC54A\uB3C4\uB85D \uC810\uC218\uC640 \uADFC\uAC70\uB97C \uC7A0\uAC14\uC2B5\uB2C8\uB2E4.</p>
        <div class="notice neutral">\uC2E4\uC81C \uD559\uC0DD \uD654\uBA74\uC5D0\uB294 \uB2E8\uACC4 \uC774\uB3D9 \uB3C4\uAD6C\uAC00 \uC5C6\uC73C\uBA70, \uBC30\uD3EC \uC2DC\uC5D0\uB294 \uC11C\uBC84\uAC00 \uC644\uB8CC \uC0C1\uD0DC\uC640 \uC218\uC815 \uAE08\uC9C0\uB97C \uAC80\uC99D\uD569\uB2C8\uB2E4.</div>
        <button id="continue-after-before" class="primary large">\uBE44\uAD50 \uC548\uB0B4\uB85C \uC774\uB3D9</button>
      </section>
    `, { step: "2 / 6 \xB7 \uC790\uAE30\uD3C9\uAC00 \u2460", title: "\uB0B4 \uC791\uD488 \uC790\uAE30\uD3C9\uAC00" }), "h1");
      document.querySelector("#continue-after-before").addEventListener("click", () => {
        record.status = "intro";
        saveRecord();
        render();
      });
      return;
    }
    const complete = selfAssessmentComplete(assessment);
    setHtml(shell(`
    <section class="hero compact">
      <span class="eyebrow">\uC790\uAE30\uD3C9\uAC00 \u2460 \xB7 \uD604\uC7AC \uD310\uB2E8</span>
      <h1 tabindex="-1">\uD604\uC7AC \uAE30\uC900\uC73C\uB85C \uB0B4 \uC791\uD488\uC744 \uD3C9\uAC00\uD569\uB2C8\uB2E4</h1>
      <p>\uC810\uC218\uB97C \uB192\uAC8C \uC8FC\uB294 \uAC83\uC774 \uBAA9\uD45C\uAC00 \uC544\uB2D9\uB2C8\uB2E4. \uC9C0\uAE08 \uC790\uAE30 \uC791\uD488\uC5D0\uC11C \uD655\uC778\uB418\uB294 \uADFC\uAC70\uB85C\uB9CC \uD310\uB2E8\uD558\uC138\uC694.</p>
    </section>
    <div class="notice neutral">\uC2E4\uC81C \uC5F0\uAD6C\uC5D0\uC11C\uB294 \uC774 \uD3C9\uAC00\uB294 \uCD5C\uC885 \uC791\uD488 \uC81C\uCD9C \uC2DC\uC810\uC5D0 \uBC1B\uACE0, \uB3D9\uB8CC \uC30D\uB300\uBE44\uAD50\uC640 \uC2DC\uAC04\uC801\uC73C\uB85C \uBD84\uB9AC\uD569\uB2C8\uB2E4. \uC544\uB798 \uC810\uC218\uC640 \uADFC\uAC70\uB294 \uBE44\uAD50 \uD654\uBA74\uC5D0 \uB2E4\uC2DC \uBCF4\uC5EC \uC8FC\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.</div>
    ${selfWorkCard()}
    <form id="self-form" class="survey-group" novalidate>
      <h2>\uB0B4 \uC791\uD488\uB9CC 1~5\uC810\uC73C\uB85C \uD3C9\uAC00</h2>
      <p class="help">\uC774 \uC5F0\uAD6C\uC6A9 \uC790\uAE30\uD3C9\uAC00\uB294 \uAD50\uC0AC \uC131\uC801 \uB8E8\uBE0C\uB9AD\uACFC \uBCC4\uB3C4\uC774\uBA70, \uB3D9\uB8CC \uC791\uD488\uC758 \uC810\uC218\uB098 \uC131\uC801\uC744 \uB73B\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.</p>
      ${selfScoreRows(assessment, "before")}
      <label class="reason-box">\uC774\uBC88 \uC810\uC218\uB97C \uC815\uD560 \uB54C \uAC00\uC7A5 \uC911\uC694\uD558\uAC8C \uBCF8 \uC790\uAE30 \uC791\uD488\uC758 \uAD6C\uCCB4\uC801 \uD2B9\uC9D5\uC774\uB098 \uC81C\uC2DC\uC790\uB8CC\uC758 \uADFC\uAC70 \uD55C \uAC00\uC9C0\uB97C \uC801\uC5B4 \uC8FC\uC138\uC694.
        <textarea id="self-evidence" rows="3" maxlength="300" placeholder="\uC790\uAE30 \uC791\uD488\uC5D0\uC11C \uC9C1\uC811 \uD655\uC778\uB418\uB294 \uADFC\uAC70\uB97C \uD55C \uBB38\uC7A5\uC73C\uB85C \uC501\uB2C8\uB2E4.">${escapeHtml(assessment.evidence)}</textarea>
        <small id="self-evidence-count">${assessment.evidence.trim().length}/300 \xB7 \uCD5C\uC18C 15\uC790</small>
      </label>
      <div class="action-bar"><button id="self-submit" class="primary" type="submit" ${complete ? "" : "disabled"}>\uC790\uAE30\uD3C9\uAC00 \u2460 \uD655\uC815</button><span>\uD655\uC815 \uB4A4 \uC30D\uB300\uBE44\uAD50\uC5D0\uC11C\uB294 \uC774 \uC810\uC218\uB97C \uD45C\uC2DC\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.</span></div>
    </form>
  `, { step: "2 / 6 \xB7 \uC790\uAE30\uD3C9\uAC00 \u2460", title: "\uB0B4 \uC791\uD488 \uC790\uAE30\uD3C9\uAC00" }), "h1");
    bindSelfScoreForm("before", renderSelfBefore);
    document.querySelector("#self-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!selfAssessmentComplete(assessment)) {
        announce("\uB2E4\uC12F \uD56D\uBAA9\uACFC \uD604\uC7AC \uD310\uB2E8 \uADFC\uAC70\uB97C \uBAA8\uB450 \uC791\uC131\uD574 \uC8FC\uC138\uC694.", true);
        return;
      }
      assessment.submittedAt = nowIso();
      record.status = "intro";
      addEvent("self_before_submit");
      saveRecord();
      render();
    });
  }
  function renderSelfAfter() {
    const assessment = record.selfAssessment.after;
    assessment.startedAt || (assessment.startedAt = nowIso());
    if (assessment.currentLockedAt) {
      const reasonCode = assessment.changeReasonCode;
      const validReasonCode = SELF_CHANGE_REASON_OPTIONS.some((option) => option.value === reasonCode);
      const reasonNeedsText = validReasonCode && reasonCode !== "unclear";
      const reasonReady = validReasonCode && (!reasonNeedsText || assessment.changeReason.trim().length >= 8);
      setHtml(shell(`
      <section class="hero compact">
        <span class="eyebrow">\uD604\uC7AC \uC810\uC218\uC640 \uADFC\uAC70 \uC800\uC7A5 \uC644\uB8CC</span>
        <h1 tabindex="-1">\uC774\uBC88 \uD310\uB2E8\uC744 \uADF8\uB807\uAC8C \uD55C \uC774\uC720\uB97C \uB0A8\uAE41\uB2C8\uB2E4</h1>
        <p>\uCC98\uC74C \uC810\uC218\uBCF4\uB2E4 \uB192\uC544\uC9D0\xB7\uB0AE\uC544\uC9D0\xB7\uAC19\uC74C\uC740 \uBAA8\uB450 \uC790\uC5F0\uC2A4\uB7EC\uC6B4 \uACB0\uACFC\uC774\uBA70 \uC5B4\uB290 \uBC29\uD5A5\uB3C4 \uC815\uB2F5\uC774 \uC544\uB2D9\uB2C8\uB2E4.</p>
      </section>
      ${selfWorkCard()}
      <form id="change-form" class="survey-group" novalidate>
        <h2>\uBCC0\uACBD \uB610\uB294 \uC720\uC9C0 \uC0AC\uC720</h2>
        <p class="help">\uC2E4\uC81C \uBC30\uD3EC\uC5D0\uC11C\uB294 \uD604\uC7AC \uD310\uB2E8\uC744 \uACE0\uC815\uD55C \uB4A4 \uC11C\uBC84\uC5D0\uC11C \uC774\uC804 \uC751\uB2F5\uACFC \uACB0\uD569\uD569\uB2C8\uB2E4. \uC774 \uD654\uBA74\uC5D0\uC11C\uB294 \uC774\uC804 \uC810\uC218\xB7\uC22B\uC790 \uCC28\uC774\xB7\uD559\uAE09 \uC21C\uC704\uB97C \uBCF4\uC5EC \uC8FC\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.</p>
        <fieldset class="survey-item"><legend>\uC774\uBC88 \uD310\uB2E8 \uACFC\uC815\uC774 \uCC98\uC74C \uD3C9\uAC00\uC640 \uBE44\uAD50\uD574 \uC5B4\uB5BB\uAC8C \uB290\uAEF4\uC84C\uC2B5\uB2C8\uAE4C?</legend>
          <div class="cue-options change-reason-options" role="radiogroup" aria-label="\uBCC0\uACBD \uB610\uB294 \uC720\uC9C0 \uC0AC\uC720 \uC720\uD615">${SELF_CHANGE_REASON_OPTIONS.map((option, index) => `<button type="button" role="radio" aria-checked="${reasonCode === option.value}" tabindex="${reasonCode === option.value || !reasonCode && index === 0 ? "0" : "-1"}" class="${reasonCode === option.value ? "selected" : ""}" data-change-reason-code="${option.value}">${escapeHtml(option.label)}</button>`).join("")}</div>
        </fieldset>
        ${reasonNeedsText ? `<label class="reason-box">\uC120\uD0DD\uD55C \uC0AC\uC720\uB97C \uC790\uAE30 \uC791\uD488\uC5D0\uC11C \uD655\uC778\uB418\uB294 \uAD6C\uCCB4\uC801 \uADFC\uAC70\uC640 \uC5F0\uACB0\uD574 \uC801\uC5B4 \uC8FC\uC138\uC694.
          <textarea id="change-reason" rows="4" maxlength="500" placeholder="\uBE44\uAD50 \uD65C\uB3D9 \uB54C\uBB38\uC774\uB77C\uACE0 \uAC00\uC815\uD558\uC9C0 \uB9D0\uACE0 \uC2E4\uC81C \uC0DD\uAC01\uC774\uB098 \uAD00\uCC30\uC744 \uC801\uC2B5\uB2C8\uB2E4.">${escapeHtml(assessment.changeReason)}</textarea>
          <small id="change-count">${assessment.changeReason.trim().length}/500 \xB7 \uCD5C\uC18C 8\uC790</small>
        </label>` : reasonCode === "unclear" ? `<div class="notice neutral">\u2018\uC774\uC720\uAC00 \uBD84\uBA85\uD558\uC9C0 \uC54A\uAC70\uB098 \uAE30\uC5B5\uB098\uC9C0 \uC54A\uC74C\u2019\uB3C4 \uC720\uD6A8\uD55C \uC751\uB2F5\uC785\uB2C8\uB2E4. \uC5B5\uC9C0\uB85C \uC774\uC720\uB97C \uB9CC\uB4E4\uC5B4 \uC4F0\uC9C0 \uC54A\uC544\uB3C4 \uB429\uB2C8\uB2E4.</div>` : ""}
        <div class="action-bar"><button id="change-submit" class="primary" type="submit" ${reasonReady ? "" : "disabled"}>\uC790\uAE30\uD3C9\uAC00 \u2461 \uC81C\uCD9C</button><span>\uC774 \uC0AC\uC720\uB294 \uC810\uC218\uC758 \uB192\uACE0 \uB0AE\uC74C\uC774 \uC544\uB2C8\uB77C \uD310\uB2E8 \uADFC\uAC70\uC758 \uBCC0\uD654\uB97C \uD574\uC11D\uD558\uB294 \uC790\uB8CC\uC785\uB2C8\uB2E4.</span></div>
      </form>
    `, { step: "4 / 6 \xB7 \uC790\uAE30\uD3C9\uAC00 \u2461", title: "\uB0B4 \uC791\uD488 \uC7AC\uD3C9\uAC00" }), "h1");
      document.querySelectorAll("[data-change-reason-code]").forEach((button) => button.addEventListener("click", () => {
        assessment.changeReasonCode = button.dataset.changeReasonCode;
        if (assessment.changeReasonCode === "unclear") assessment.changeReason = "";
        assessment.changeReasonAt = nowIso();
        addEvent("self_change_reason_code", { value: assessment.changeReasonCode });
        saveRecord();
        renderSelfAfter();
        requestAnimationFrame(() => document.querySelector(`[data-change-reason-code="${assessment.changeReasonCode}"]`)?.focus({ preventScroll: true }));
      }));
      bindRadioArrowKeys(".change-reason-options");
      const reason = document.querySelector("#change-reason");
      if (reason) reason.addEventListener("input", () => {
        assessment.changeReason = reason.value;
        assessment.changeReasonAt = nowIso();
        saveRecord();
        document.querySelector("#change-submit").disabled = assessment.changeReason.trim().length < 8;
        document.querySelector("#change-count").textContent = assessment.changeReason.trim().length + "/500 \xB7 \uCD5C\uC18C 8\uC790";
      });
      document.querySelector("#change-form").addEventListener("submit", (event) => {
        event.preventDefault();
        if (!selfAssessmentComplete(assessment, { requireChangeReason: true })) return;
        assessment.submittedAt = nowIso();
        record.status = "aiIntro";
        addEvent("self_after_submit", { deltaClass: assessment.deltaClass, reasonCode: assessment.changeReasonCode });
        saveRecord();
        render();
      });
      return;
    }
    const complete = selfAssessmentComplete(assessment);
    setHtml(shell(`
    <section class="hero compact">
      <span class="eyebrow">\uC790\uAE30\uD3C9\uAC00 \u2461 \xB7 \uD604\uC7AC \uD310\uB2E8</span>
      <h1 tabindex="-1">\uD604\uC7AC \uAE30\uC900\uC73C\uB85C \uB0B4 \uC791\uD488\uC744 \uD3C9\uAC00\uD569\uB2C8\uB2E4</h1>
      <p>\uC810\uC218\uB97C \uB192\uAC8C \uC8FC\uB294 \uAC83\uC774 \uBAA9\uD45C\uAC00 \uC544\uB2D9\uB2C8\uB2E4. \uC9C0\uAE08 \uC790\uAE30 \uC791\uD488\uC5D0\uC11C \uD655\uC778\uB418\uB294 \uADFC\uAC70\uB85C\uB9CC \uD310\uB2E8\uD558\uC138\uC694.</p>
    </section>
    <div class="notice neutral">\uD604\uC7AC \uC810\uC218\uC640 \uADFC\uAC70\uB97C \uD655\uC815\uD558\uAE30 \uC804\uC5D0\uB294 \uB2E4\uB978 \uC751\uB2F5\uACFC \uD559\uAE09 \uACB0\uACFC\uB97C \uD45C\uC2DC\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uC774 \uB3C5\uB9BD \uD504\uB85C\uD1A0\uD0C0\uC785\uC740 \uD654\uBA74 \uC21C\uC11C\uB9CC \uC7AC\uD604\uD558\uBA70, \uC2E4\uC81C \uBC30\uD3EC\uC5D0\uC11C\uB294 \uC774\uC804 \uC751\uB2F5\uC744 \uC774 \uD654\uBA74\uC5D0 \uBCF4\uB0B4\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.</div>
    ${selfWorkCard()}
    <form id="self-form" class="survey-group" novalidate>
      <h2>\uB0B4 \uC791\uD488\uB9CC 1~5\uC810\uC73C\uB85C \uD3C9\uAC00</h2>
      <p class="help">\uC774 \uC5F0\uAD6C\uC6A9 \uC790\uAE30\uD3C9\uAC00\uB294 \uAD50\uC0AC \uC131\uC801 \uB8E8\uBE0C\uB9AD\uACFC \uBCC4\uB3C4\uC774\uBA70, \uB3D9\uB8CC \uC791\uD488\uC758 \uC810\uC218\uB098 \uC131\uC801\uC744 \uB73B\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.</p>
      ${selfScoreRows(assessment, "after")}
      <label class="reason-box">\uC774\uBC88 \uC810\uC218\uB97C \uC815\uD560 \uB54C \uAC00\uC7A5 \uC911\uC694\uD558\uAC8C \uBCF8 \uC790\uAE30 \uC791\uD488\uC758 \uAD6C\uCCB4\uC801 \uD2B9\uC9D5\uC774\uB098 \uC81C\uC2DC\uC790\uB8CC\uC758 \uADFC\uAC70 \uD55C \uAC00\uC9C0\uB97C \uC801\uC5B4 \uC8FC\uC138\uC694.
        <textarea id="self-evidence" rows="3" maxlength="300" placeholder="\uC790\uAE30 \uC791\uD488\uC5D0\uC11C \uC9C1\uC811 \uD655\uC778\uB418\uB294 \uADFC\uAC70\uB97C \uD55C \uBB38\uC7A5\uC73C\uB85C \uC501\uB2C8\uB2E4.">${escapeHtml(assessment.evidence)}</textarea>
        <small id="self-evidence-count">${assessment.evidence.trim().length}/300 \xB7 \uCD5C\uC18C 15\uC790</small>
      </label>
      <div class="action-bar"><button id="self-submit" class="primary" type="submit" ${complete ? "" : "disabled"}>\uD604\uC7AC \uC810\uC218\uC640 \uADFC\uAC70 \uD655\uC815</button><span>\uD655\uC815\uD55C \uB4A4 \uBCC0\uACBD\xB7\uC720\uC9C0 \uC0AC\uC720\uB97C \uC791\uC131\uD569\uB2C8\uB2E4.</span></div>
    </form>
  `, { step: "4 / 6 \xB7 \uC790\uAE30\uD3C9\uAC00 \u2461", title: "\uB0B4 \uC791\uD488 \uC7AC\uD3C9\uAC00" }), "h1");
    bindSelfScoreForm("after", renderSelfAfter);
    document.querySelector("#self-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!selfAssessmentComplete(assessment)) {
        announce("\uB2E4\uC12F \uD56D\uBAA9\uACFC \uD604\uC7AC \uD310\uB2E8 \uADFC\uAC70\uB97C \uBAA8\uB450 \uC791\uC131\uD574 \uC8FC\uC138\uC694.", true);
        return;
      }
      assessment.currentLockedAt = nowIso();
      const change = classifySelfChange(record.selfAssessment.before.scores, assessment.scores);
      assessment.deltaByItem = change.deltaByItem;
      assessment.deltaClass = change.deltaClass;
      assessment.deltaCalculatedAt = nowIso();
      addEvent("self_after_current_lock", { deltaClass: change.deltaClass });
      saveRecord();
      renderSelfAfter();
    });
  }
  function renderIntro() {
    setHtml(shell(`
    <section class="hero">
      <span class="eyebrow">\uC791\uD488\uC744 \uBCF4\uAE30 \uC804 \uC548\uB0B4</span>
      <h1 tabindex="-1">\uB450 \uC791\uD488 \uAC00\uC6B4\uB370 \uD55C \uC810\uC744 \uACE0\uB985\uB2C8\uB2E4</h1>
      <p class="lead">\uB450 \uC791\uD488 \uC911 \uC774 \uC218\uC5C5\uC758 \uC9C8\uBB38\uC778 <q>\uBB34\uC5C7\uC774 \uC774\uBBF8\uC9C0\uB97C \uBBF8\uC220\uB85C \uB9CC\uB4DC\uB294\uAC00?</q>\uC5D0 \uB354 \uC124\uB4DD\uB825 \uC788\uAC8C \uC751\uB2F5\uD558\uB294 \uC791\uD488\uC744 \uACE0\uB974\uC138\uC694.</p>
      <div class="rule-grid">
        <article><b>\uD55C \uAC00\uC9C0 \uC9C8\uBB38</b><p>\uB9E4 \uBE44\uAD50\uC5D0\uC11C \uAC19\uC740 \uC9C8\uBB38\uC73C\uB85C \uD310\uB2E8\uD569\uB2C8\uB2E4.</p></article>
        <article><b>\uC791\uAC00 \uCD94\uCE21 \uAE08\uC9C0</b><p>\uC774\uB984\xB7\uD559\uAE09\xB7\uB3C4\uAD6C\xB7\uC810\uC218\uB294 \uBCF4\uC774\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.</p></article>
        <article><b>\uCD1D 12\uD68C \uAC15\uC81C\uC120\uD0DD</b><p>\uB9E4 \uD654\uBA74\uC5D0\uC11C \uD55C \uC810\uC744 \uACE0\uB985\uB2C8\uB2E4. \uC791\uD488 \uC810\uC218\uB294 \uC785\uB825\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.</p></article>
        <article><b>\uD310\uB2E8 \uD655\uC2E0</b><p>\uC120\uD0DD \uB4A4 \uC791\uD488 \uC810\uC218\uAC00 \uC544\uB2CC \uD310\uB2E8\uC758 \uD655\uC2E0\uB9CC \uB9D0\uB85C \uD45C\uC2DC\uD569\uB2C8\uB2E4.</p></article>
        <article><b>\uBE44\uACF5\uAC1C \uC751\uB2F5</b><p>\uC120\uD0DD\uC740 \uC131\uC801\xB7\uACF5\uAC1C \uC21C\uC704\uC5D0 \uC0AC\uC6A9\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.</p></article>
      </div>
      <div class="notice neutral">\uC2E4\uC81C \uC5F0\uAD6C\uC5D0\uC11C\uB294 \uC0AC\uC804\uC124\uBB38\uC744 \uB2E8\uC6D0 \uC2DC\uC791 \uC804\uC5D0 \uB9C8\uCE58\uACE0 \uC774 \uD654\uBA74\uC740 8\uCC28\uC2DC\uC5D0 \uB530\uB85C \uC5FD\uB2C8\uB2E4. \uC9C0\uAE08\uC740 \uD654\uBA74 \uAC80\uD1A0\uB97C \uC704\uD574 \uC774\uC5B4\uC11C \uC9C4\uD589\uD569\uB2C8\uB2E4.</div>
      <button id="start-pairs" class="primary large">\uC791\uD488 \uBE44\uAD50 \uC2DC\uC791</button>
    </section>
  `, { step: "3 / 6 \xB7 \uBE44\uAD50 \uC548\uB0B4", title: "\uD559\uC0DD \uC791\uD488 \uC30D\uB300\uBE44\uAD50" }), "h1");
    document.querySelector("#start-pairs").addEventListener("click", () => {
      var _a2;
      record.status = "pair";
      (_a2 = record.pairwise).startedAt || (_a2.startedAt = nowIso());
      addEvent("pairwise_start");
      saveRecord();
      render();
    });
  }
  function workCard(work, slot, trial, draft) {
    const selected = draft.choiceWorkId === work.id;
    const showContext = trial.context === "image_context";
    return `<article class="work-card ${selected ? "chosen" : ""}" data-work-id="${work.id}">
    <button class="work-choice" type="button" data-choose-work="${work.id}" aria-pressed="${selected}">
      <span class="work-slot">\uC791\uD488 ${slot === "first" ? "A" : "B"}</span>
      <span class="work-image" data-seen-work="${work.id}"><img src="${work.image}" alt="\uC775\uBA85 \uC791\uD488 ${slot === "first" ? "A" : "B"}" /></span>
      ${showContext ? `<span class="work-context"><b>\u300C${escapeHtml(work.title)}\u300D</b><small>${escapeHtml(work.relic)}</small><p>${escapeHtml(work.statement)}</p></span>` : ""}
      <span class="choose-label">${selected ? "\u2713 \uC774 \uC791\uD488\uC744 \uC120\uD0DD\uD568" : "\uC774 \uC791\uD488 \uC120\uD0DD"}</span>
    </button>
  </article>`;
  }
  function ensurePairDraft(trial) {
    const current = record.pairwise.draft;
    if (current && current.trialId === trial.trialId) return current;
    const draft = {
      trialId: trial.trialId,
      pairId: trial.pairId,
      renderedAt: nowIso(),
      renderedEpochMs: Date.now(),
      firstSeenAtByWork: {},
      bothSeenAt: null,
      choiceWorkId: null,
      choiceAt: null,
      choiceChanges: 0,
      confidence: null,
      confidenceAt: null,
      reasonText: "",
      reasonAt: null,
      layoutAtRender: null,
      layoutEvents: []
    };
    record.pairwise.draft = draft;
    addEvent("trial_render", { trialId: trial.trialId, pairId: trial.pairId });
    saveRecord();
    return draft;
  }
  function bindVisibility(trial, draft) {
    var _a2, _b2, _c2, _d2;
    if (!("IntersectionObserver" in window)) {
      const at = nowIso();
      (_a2 = draft.firstSeenAtByWork)[_b2 = trial.leftWorkId] || (_a2[_b2] = at);
      (_c2 = draft.firstSeenAtByWork)[_d2 = trial.rightWorkId] || (_c2[_d2] = at);
      draft.bothSeenAt || (draft.bothSeenAt = at);
      saveRecord();
      return;
    }
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || entry.intersectionRatio < 0.6) continue;
        const workId = entry.target.dataset.seenWork;
        if (!draft.firstSeenAtByWork[workId]) {
          draft.firstSeenAtByWork[workId] = nowIso();
          addEvent("work_seen", { trialId: trial.trialId, workId, ratio: entry.intersectionRatio });
        }
      }
      if (!draft.bothSeenAt && draft.firstSeenAtByWork[trial.leftWorkId] && draft.firstSeenAtByWork[trial.rightWorkId]) {
        draft.bothSeenAt = nowIso();
        addEvent("both_seen", { trialId: trial.trialId });
      }
      saveRecord();
    }, { threshold: [0.6] });
    document.querySelectorAll("[data-seen-work]").forEach((image) => observer.observe(image));
  }
  function renderPair() {
    var _a2, _b2;
    const completed = record.pairwise.trials.length;
    if (completed >= PLAN.trials.length) {
      (_a2 = record.pairwise).submittedAt || (_a2.submittedAt = nowIso());
      record.pairwise.draft = null;
      record.status = "selfAfter";
      (_b2 = record.selfAssessment.after).startedAt || (_b2.startedAt = nowIso());
      addEvent("pairwise_submit", { mainTrials: PLAN.mainTrialCount, repeatTrials: PLAN.repeatTrialCount });
      saveRecord();
      render();
      return;
    }
    const trial = PLAN.trials[completed];
    const draft = ensurePairDraft(trial);
    const left = WORK_BY_ID.get(trial.leftWorkId);
    const right = WORK_BY_ID.get(trial.rightWorkId);
    const showConfidence = !!draft.choiceWorkId;
    const showReason = showConfidence && Number(draft.confidence) > 0 && trial.reasonPrompted;
    const ready = showConfidence && Number(draft.confidence) > 0 && (!trial.reasonPrompted || draft.reasonText.trim().length >= 8);
    setHtml(shell(`
    <section class="pair-head">
      <div><span class="eyebrow">\uC791\uD488 \uBE44\uAD50 ${completed + 1} / ${PLAN.trials.length}</span><h1 tabindex="-1">\uC5B4\uB290 \uC791\uD488\uC774 \uB354 \uC124\uB4DD\uB825 \uC788\uC2B5\uB2C8\uAE4C?</h1></div>
      <div class="trial-progress"><i style="width:${completed / PLAN.trials.length * 100}%"></i></div>
    </section>
    <p class="pair-question">${escapeHtml(PAIRWISE_DEFAULTS.question)}</p>
    <p class="help center">\uC791\uD488\uC758 \uC720\uBA85\uD568\uC774\uB098 \uC791\uAC00 \uCD94\uCE21\uC774 \uC544\uB2C8\uB77C, \uD654\uBA74\uACFC \uD604\uC7AC \uC81C\uC2DC\uB41C \uC790\uB8CC\uC5D0\uC11C \uD655\uC778\uB418\uB294 \uADFC\uAC70\uB85C \uD310\uB2E8\uD558\uC138\uC694. \uC881\uC740 \uD654\uBA74\uC5D0\uC11C\uB294 \uC544\uB798 \uC791\uD488\uAE4C\uC9C0 \uD655\uC778\uD55C \uB4A4 \uC120\uD0DD\uD558\uC138\uC694.</p>
    <div class="pair-grid">${workCard(left, "first", trial, draft)}${workCard(right, "second", trial, draft)}</div>
    <section class="response-panel" aria-labelledby="response-title">
      <h2 id="response-title" tabindex="-1">\uC120\uD0DD\uD55C \uB4A4 \uD655\uC2E0\uB3C4\uB97C \uD45C\uC2DC\uD558\uC138\uC694</h2>
      ${showConfidence ? `<fieldset class="confidence"><legend>\uC774 \uD56D\uBAA9\uC740 \uC791\uD488 \uC810\uC218\uAC00 \uC544\uB2C8\uB77C, \uBC29\uAE08 \uC120\uD0DD\uD55C \uD310\uB2E8\uC758 \uD655\uC2E0\uC785\uB2C8\uB2E4.</legend>
        <div class="confidence-options" role="radiogroup" aria-label="\uC791\uD488 \uC810\uC218\uAC00 \uC544\uB2CC \uD310\uB2E8 \uD655\uC2E0">${CONFIDENCE_LABELS.map((label, i) => `<button type="button" role="radio" aria-checked="${draft.confidence === i + 1}" tabindex="${draft.confidence === i + 1 || !draft.confidence && i === 0 ? "0" : "-1"}" class="${draft.confidence === i + 1 ? "selected" : ""}" data-confidence="${i + 1}"><span>${escapeHtml(label)}</span></button>`).join("")}</div>
      </fieldset>` : `<p class="muted">\uBA3C\uC800 \uC791\uD488 A \uB610\uB294 B\uB97C \uC120\uD0DD\uD558\uBA74 \uD655\uC2E0\uB3C4 \uBB38\uD56D\uC774 \uB098\uD0C0\uB0A9\uB2C8\uB2E4.</p>`}
      ${showReason ? `<label class="reason-box">\uACB0\uC815\uC5D0 \uAC00\uC7A5 \uD070 \uC601\uD5A5\uC744 \uC900 \uD654\uBA74\uC0C1\uC758 \uD2B9\uC9D5 \uB610\uB294 \uC81C\uC2DC\uC790\uB8CC\uC758 \uADFC\uAC70\uB97C \uD55C \uBB38\uC7A5\uC73C\uB85C \uC801\uC5B4 \uC8FC\uC138\uC694.
        <textarea id="reason" rows="3" maxlength="300" placeholder="\uB208\uC5D0 \uBCF4\uC774\uAC70\uB098 \uC81C\uC2DC\uB41C \uAD6C\uCCB4\uC801\uC778 \uADFC\uAC70\uB97C \uC801\uC2B5\uB2C8\uB2E4.">${escapeHtml(draft.reasonText)}</textarea>
        <small>${draft.reasonText.trim().length}/300 \xB7 \uCD5C\uC18C 8\uC790</small></label>` : ""}
      <div class="action-bar"><button id="commit-pair" class="primary" ${ready ? "" : "disabled"}>${completed + 1 >= PLAN.trials.length ? "\uC791\uD488 \uBE44\uAD50 \uB9C8\uCE58\uAE30" : "\uC774 \uD310\uB2E8 \uC800\uC7A5\uD558\uACE0 \uB2E4\uC74C \u2192"}</button><span>\uC800\uC7A5\uD55C \uD310\uB2E8\uC740 \uC55E \uD654\uBA74\uC73C\uB85C \uB3CC\uC544\uAC00 \uACE0\uCE58\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.</span></div>
    </section>
  `, { step: "3 / 6 \xB7 \uC30D\uB300\uBE44\uAD50", title: "\uD559\uC0DD \uC791\uD488 \uC30D\uB300\uBE44\uAD50" }), "h1");
    requestAnimationFrame(() => {
      if (!draft.layoutAtRender) {
        draft.layoutAtRender = layoutSnapshot(trial);
        saveRecord();
      }
      bindVisibility(trial, draft);
    });
    document.querySelectorAll("[data-choose-work]").forEach((button) => button.addEventListener("click", () => {
      if (!draft.bothSeenAt) {
        const unseenWorkId = [trial.leftWorkId, trial.rightWorkId].find((workId) => !draft.firstSeenAtByWork[workId]);
        addEvent("choice_blocked_before_both_seen", { trialId: trial.trialId, attemptedWorkId: button.dataset.chooseWork, unseenWorkId: unseenWorkId || null });
        saveRecord();
        announce("\uB450 \uC791\uD488 \uC774\uBBF8\uC9C0\uB97C \uBAA8\uB450 \uD655\uC778\uD55C \uB4A4 \uC120\uD0DD\uD574 \uC8FC\uC138\uC694.", true);
        const unseenImage = unseenWorkId && document.querySelector(`[data-seen-work="${unseenWorkId}"]`);
        if (unseenImage) unseenImage.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
        return;
      }
      const next = button.dataset.chooseWork;
      if (draft.choiceWorkId && draft.choiceWorkId !== next) draft.choiceChanges += 1;
      draft.choiceWorkId = next;
      draft.choiceAt = nowIso();
      addEvent("choice", { trialId: trial.trialId, workId: next, changes: draft.choiceChanges });
      saveRecord();
      renderPair();
      requestAnimationFrame(() => document.querySelector("#response-title")?.focus());
    }));
    document.querySelectorAll("[data-confidence]").forEach((button) => button.addEventListener("click", () => {
      draft.confidence = Number(button.dataset.confidence);
      draft.confidenceAt = nowIso();
      addEvent("confidence", { trialId: trial.trialId, value: draft.confidence });
      saveRecord();
      renderPair();
      requestAnimationFrame(() => (document.querySelector("#reason") || document.querySelector("#commit-pair"))?.focus());
    }));
    bindRadioArrowKeys(".confidence-options");
    const reason = document.querySelector("#reason");
    if (reason) reason.addEventListener("input", () => {
      draft.reasonText = reason.value;
      draft.reasonAt = nowIso();
      saveRecord();
      const button = document.querySelector("#commit-pair");
      if (button) button.disabled = draft.reasonText.trim().length < 8;
    });
    document.querySelector("#commit-pair").addEventListener("click", () => commitPair(trial, draft));
  }
  function commitPair(trial, draft) {
    if (!draft.choiceWorkId || !draft.confidence) return;
    if (trial.reasonPrompted && draft.reasonText.trim().length < 8) return;
    const layout = layoutSnapshot(trial);
    const first = trial.leftWorkId;
    const chosenFirst = draft.choiceWorkId === first;
    const bothSeenMs = draft.bothSeenAt ? new Date(draft.bothSeenAt).getTime() : draft.renderedEpochMs;
    const choiceMs = draft.choiceAt ? new Date(draft.choiceAt).getTime() : Date.now();
    const committedAt = nowIso();
    const result = {
      trialId: trial.trialId,
      pairId: trial.pairId,
      displayIndex: trial.displayIndex,
      repeatOf: trial.repeatOf,
      logicalSlots: [
        { slot: "first", workId: trial.leftWorkId },
        { slot: "second", workId: trial.rightWorkId }
      ],
      contextCondition: trial.context,
      contextAssignmentUnit: trial.contextAssignmentUnit,
      contextPayloadHash: trial.contextPayloadHash,
      reasonPrompted: trial.reasonPrompted,
      reasonDraw: trial.reasonDraw,
      reasonAlgorithmVersion: trial.reasonAlgoVersion,
      renderedAt: draft.renderedAt,
      firstSeenAtByWork: draft.firstSeenAtByWork,
      bothSeenAt: draft.bothSeenAt,
      choiceWorkId: draft.choiceWorkId,
      choiceSlot: chosenFirst ? "first" : "second",
      choicePhysicalPosition: chosenFirst ? layout.firstPhysical : layout.secondPhysical,
      choiceAt: draft.choiceAt,
      choiceRtMs: Math.max(0, choiceMs - bothSeenMs),
      choiceChanges: draft.choiceChanges,
      confidence: draft.confidence,
      confidenceAt: draft.confidenceAt,
      reasonStatus: trial.reasonPrompted ? "collected" : "not_sampled",
      reasonText: trial.reasonPrompted ? draft.reasonText.trim() : null,
      reasonAt: trial.reasonPrompted ? draft.reasonAt : null,
      reasonCharCount: trial.reasonPrompted ? draft.reasonText.trim().length : 0,
      layoutAtRender: draft.layoutAtRender,
      layoutAtChoice: layout,
      layoutEvents: draft.layoutEvents,
      committedAt
    };
    record.pairwise.trials.push(result);
    record.pairwise.draft = null;
    addEvent("trial_commit", { trialId: trial.trialId, choiceWorkId: draft.choiceWorkId });
    saveRecord();
    window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    renderPair();
  }
  function renderAiIntro() {
    setHtml(shell(`
    <section class="hero">
      <span class="eyebrow">\uBAA8\uB4E0 \uC791\uD488 \uC120\uD0DD\uC774 \uB05D\uB0AC\uC2B5\uB2C8\uB2E4</span>
      <h1 tabindex="-1">\uC774\uC81C \uC774\uBBF8\uC9C0\uC758 \uC778\uC0C1\uC744 \uB530\uB85C \uBB3B\uC2B5\uB2C8\uB2E4</h1>
      <p class="lead">\uC55E\uC5D0\uC11C \uBB34\uC5C7\uC744 \uC120\uD0DD\uD588\uB294\uC9C0\uB294 \uBCF4\uC5EC \uC8FC\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uC791\uD488\uC744 \uD55C \uC810\uC529 \uBCF4\uBA70 \uC774\uBBF8\uC9C0\uAC00 \uC5B4\uB5BB\uAC8C \uB290\uAEF4\uC9C0\uB294\uC9C0 1~7\uB2E8\uACC4\uB85C \uB2F5\uD569\uB2C8\uB2E4.</p>
      <div class="notice neutral">\uC774\uAC83\uC740 \uC5F0\uAD6C\uC6A9 \uC774\uBBF8\uC9C0 \uC778\uC0C1 \uBB38\uD56D\uC774\uBA70 \uC791\uD488 \uC810\uC218\uB098 \uC131\uC801 \uD3C9\uAC00\uAC00 \uC544\uB2D9\uB2C8\uB2E4. \uC790\uAE30 \uC791\uD488 \uC7AC\uD3C9\uAC00\uB97C \uBAA8\uB450 \uD655\uC815\uD55C \uB4A4\uC5D0\uB9CC \uC81C\uC2DC\uD569\uB2C8\uB2E4.</div>
      <button id="start-ai" class="primary large">\uC774\uBBF8\uC9C0 \uC778\uC0C1 \uC751\uB2F5 \uC2DC\uC791</button>
    </section>
  `, { step: "5 / 6 \xB7 \uC5F0\uAD6C\uC6A9 \uC774\uBBF8\uC9C0 \uC778\uC0C1", title: "\uC774\uBBF8\uC9C0 \uC778\uC0C1 \uC751\uB2F5" }), "h1");
    document.querySelector("#start-ai").addEventListener("click", () => {
      var _a2;
      record.status = "ai";
      (_a2 = record.aiRatings).startedAt || (_a2.startedAt = nowIso());
      addEvent("ai_rating_start");
      saveRecord();
      render();
    });
  }
  function ensureAiDraft(item) {
    if (record.aiRatings.draft && record.aiRatings.draft.workId === item.workId) return record.aiRatings.draft;
    record.aiRatings.draft = { workId: item.workId, answers: {}, cue: null, startedAt: nowIso() };
    saveRecord();
    return record.aiRatings.draft;
  }
  function renderAi() {
    var _a2;
    const completed = record.aiRatings.items.length;
    if (completed >= RATING_PLAN.length) {
      (_a2 = record.aiRatings).submittedAt || (_a2.submittedAt = nowIso());
      record.aiRatings.draft = null;
      record.status = "done";
      saveRecord();
      render();
      return;
    }
    const item = RATING_PLAN[completed];
    const work = WORK_BY_ID.get(item.workId);
    const draft = ensureAiDraft(item);
    const needsCue = Number(draft.answers.ai_like) >= 5 || Number(draft.answers.ai_trace) >= 5;
    const complete = AI_RATING_ITEMS.every((question) => Number(draft.answers[question.id]) >= 1) && (!needsCue || draft.cue);
    setHtml(shell(`
    <section class="single-head"><span class="eyebrow">\uAC1C\uBCC4 \uC791\uD488 ${completed + 1} / ${RATING_PLAN.length}</span><h1 tabindex="-1">\uD55C \uC791\uD488\uC758 \uC778\uC0C1</h1></section>
    <div class="notice neutral">\uC544\uB798 \uC751\uB2F5\uC740 \uC791\uD488 \uC810\uC218\uB098 \uC131\uC801\uC774 \uC544\uB2C8\uB77C \uC5F0\uAD6C\uC6A9 \uC774\uBBF8\uC9C0 \uC778\uC0C1 \uCE21\uC815\uC785\uB2C8\uB2E4.</div>
    <div class="single-work">
      <img src="${work.image}" alt="\uC775\uBA85 \uC791\uD488 \uC774\uBBF8\uC9C0" />
      ${item.context === "image_context" ? `<div class="work-context"><b>\u300C${escapeHtml(work.title)}\u300D</b><small>${escapeHtml(work.relic)}</small><p>${escapeHtml(work.statement)}</p></div>` : ""}
    </div>
    <form id="ai-form">
      ${AI_RATING_ITEMS.map((question, index) => `<fieldset class="survey-item"><legend><span>${index + 1}</span>${escapeHtml(question.text)}</legend>
        <div class="answer-options seven" role="radiogroup" aria-label="${escapeHtml(question.text)}">${Array.from({ length: 7 }, (_, i) => `<button type="button" role="radio" aria-checked="${draft.answers[question.id] === i + 1}" tabindex="${draft.answers[question.id] === i + 1 || !draft.answers[question.id] && i === 0 ? "0" : "-1"}" class="${draft.answers[question.id] === i + 1 ? "selected" : ""}" data-ai-item="${question.id}" data-value="${i + 1}"><b>${i + 1}</b>${i === 0 ? "<small>\uC804\uD600 \uADF8\uB807\uC9C0 \uC54A\uB2E4</small>" : i === 6 ? "<small>\uB9E4\uC6B0 \uADF8\uB807\uB2E4</small>" : ""}</button>`).join("")}</div>
      </fieldset>`).join("")}
      ${needsCue ? `<fieldset class="survey-item cue"><legend>\uADF8\uB807\uAC8C \uB290\uB080 \uAC00\uC7A5 \uD070 \uADFC\uAC70\uB294 \uBB34\uC5C7\uC785\uB2C8\uAE4C?</legend><div class="cue-options" role="radiogroup" aria-label="AI \uC774\uBBF8\uC9C0\uCC98\uB7FC \uB290\uB080 \uAC00\uC7A5 \uD070 \uADFC\uAC70">${AI_CUE_OPTIONS.map((cue, index) => `<button type="button" role="radio" aria-checked="${draft.cue === cue.value}" tabindex="${draft.cue === cue.value || !draft.cue && index === 0 ? "0" : "-1"}" class="${draft.cue === cue.value ? "selected" : ""}" data-cue="${cue.value}">${escapeHtml(cue.label)}</button>`).join("")}</div></fieldset>` : ""}
      <div class="action-bar"><button class="primary" type="submit" ${complete ? "" : "disabled"}>${completed + 1 >= RATING_PLAN.length ? "\uD3C9\uAC00 \uB9C8\uCE58\uAE30" : "\uC800\uC7A5\uD558\uACE0 \uB2E4\uC74C \uC791\uD488 \u2192"}</button><span>\uC55E\uC758 \uC30D\uB300\uC120\uD0DD \uACB0\uACFC\uB294 \uD45C\uC2DC\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.</span></div>
    </form>
  `, { step: "5 / 6 \xB7 AI\uB2E4\uC6C0 \uC0AC\uD6C4 \uCE21\uC815", title: "\uC774\uBBF8\uC9C0 \uC778\uC0C1 \uC751\uB2F5" }), "h1");
    document.querySelectorAll("[data-ai-item]").forEach((button) => button.addEventListener("click", () => {
      const itemId = button.dataset.aiItem;
      const value = Number(button.dataset.value);
      draft.answers[itemId] = value;
      saveRecord();
      renderAi();
      requestAnimationFrame(() => document.querySelector(`[data-ai-item="${itemId}"][data-value="${value}"]`)?.focus({ preventScroll: true }));
    }));
    document.querySelectorAll("[data-cue]").forEach((button) => button.addEventListener("click", () => {
      const cueValue = button.dataset.cue;
      draft.cue = cueValue;
      saveRecord();
      renderAi();
      requestAnimationFrame(() => document.querySelector(`[data-cue="${cueValue}"]`)?.focus({ preventScroll: true }));
    }));
    bindRadioArrowKeys(".answer-options, .cue-options");
    document.querySelector("#ai-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!complete) return;
      record.aiRatings.items.push({
        workId: item.workId,
        contextCondition: item.context,
        contextPayloadHash: PLAN.contextPayloadHashByWork[item.workId],
        answers: { ...draft.answers },
        cue: needsCue ? draft.cue : "not_required",
        startedAt: draft.startedAt,
        submittedAt: nowIso()
      });
      record.aiRatings.draft = null;
      addEvent("ai_rating_commit", { workId: item.workId });
      saveRecord();
      window.scrollTo({ top: 0 });
      renderAi();
    });
  }
  function downloadJson() {
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pairwise-prototype-record.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }
  function renderDone() {
    setHtml(shell(`
    <section class="hero done">
      <span class="eyebrow">RECORD COMPLETE</span>
      <h1 tabindex="-1">\uBAA8\uB4E0 \uC751\uB2F5\uC744 \uB9C8\uCCE4\uC2B5\uB2C8\uB2E4</h1>
      <p class="lead">\uC120\uD0DD \uACB0\uACFC\uB098 \uAC1C\uC778 \uC21C\uC704\uB294 \uD559\uC0DD\uC5D0\uAC8C \uBCF4\uC5EC \uC8FC\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uC774 \uD504\uB85C\uD1A0\uD0C0\uC785\uC5D0\uC11C\uB294 \uC800\uC7A5\uB420 \uC5F0\uAD6C \uB85C\uADF8 \uAD6C\uC870\uB9CC \uB0B4\uB824\uBC1B\uC544 \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p>
      <div class="summary-grid">
        <article><b>${record.pre.submittedAt ? PRE_SURVEY_ITEMS.length : 0}</b><span>\uC0AC\uC804\uC124\uBB38 \uC751\uB2F5</span></article>
        <article><b>${Number(!!record.selfAssessment.before.submittedAt) + Number(!!record.selfAssessment.after.submittedAt)}</b><span>\uB0B4 \uC791\uD488 \uC790\uAE30\uD3C9\uAC00</span></article>
        <article><b>${record.pairwise.trials.length}</b><span>\uC800\uC7A5\uB41C \uBE44\uAD50\uD310\uB2E8</span></article>
        <article><b>${record.aiRatings.items.length}</b><span>\uC5F0\uAD6C\uC6A9 \uC774\uBBF8\uC9C0 \uC778\uC0C1</span></article>
        <article><b>${record.events.length}</b><span>\uACFC\uC815 \uC774\uBCA4\uD2B8</span></article>
      </div>
      <button id="download-json" class="primary large">\uAC80\uD1A0\uC6A9 JSON \uB0B4\uB824\uBC1B\uAE30</button>
      <p class="help">\uD559\uBC88\xB7\uC774\uB984\xB7\uBCC4\uBA85\uC740 \uD3EC\uD568\uD558\uC9C0 \uC54A\uC740 \uAC00\uC0C1 \uC790\uB8CC\uC785\uB2C8\uB2E4.</p>
    </section>
  `, { step: "6 / 6 \xB7 \uC644\uB8CC", title: "\uC751\uB2F5 \uC644\uB8CC" }), "h1");
    document.querySelector("#download-json").addEventListener("click", downloadJson);
  }
  function announce(message, error = false) {
    let node = document.querySelector("#live-message");
    if (!node) {
      node = document.createElement("div");
      node.id = "live-message";
      node.className = error ? "live error" : "live";
      node.setAttribute("role", error ? "alert" : "status");
      document.body.appendChild(node);
    }
    node.textContent = message;
    setTimeout(() => node.remove(), 3500);
  }
  function render() {
    const stage = record.status || "pre";
    if (stage === "pre") renderPre();
    else if (stage === "selfBefore") renderSelfBefore();
    else if (stage === "intro") renderIntro();
    else if (stage === "pair") renderPair();
    else if (stage === "selfAfter") renderSelfAfter();
    else if (stage === "aiIntro") renderAiIntro();
    else if (stage === "ai") renderAi();
    else renderDone();
  }
  window.addEventListener("resize", () => {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (record.status !== "pair" || !record.pairwise.draft) return;
      const trial = PLAN.trials[record.pairwise.trials.length];
      if (!trial) return;
      const snapshot = layoutSnapshot(trial);
      record.pairwise.draft.layoutEvents.push({ at: nowIso(), ...snapshot });
      addEvent("layout_change", { trialId: trial.trialId, axis: snapshot.axis });
      saveRecord();
    }, 180);
  });
  window.addEventListener("pagehide", saveRecord);
  render();
})();
