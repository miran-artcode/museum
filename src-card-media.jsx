/* ============================================================
   방법 카드의 도판과 설명 링크 — 관찰 방법(다섯)·사회를 드러내는 방법(여덟)

   카드 정의(OBS_METHODS · ENGAGE_MODES)는 src-app.jsx에 있고, 여기에는 카드마다
   붙는 작품 사진과 신뢰할 수 있는 설명 링크만 둔다. 그리는 조각은 읽기 자료와
   같은 것(LessonImages · WorkLinks)을 쓰므로 강의 노트의 도판과 모양이 같다.
   사진 파일과 출처는 public/img/lessons/SOURCES.md 에 적혀 있다.
   ============================================================ */

import React from "react";
import { LessonImages, WorkLinks } from "./src-content.jsx";

export const CARD_MEDIA = {
  obs: {
    drift: {
      images: [
        { src: "/img/lessons/L2_w_t1_drift.jpg", cap: "기 드보르, 「파리 심리지리 가이드: 사랑의 정념에 관한 담론」(1957). 파리 조감도를 잘라 낸 조각들을 흩어 놓고 붉은 화살표로 ‘표류(dérive)’의 경로와 ‘분위기 단위’의 위치를 이어 놓은 석판화 지도로, ‘상상주의 바우하우스’(MIBI) 명의로 펴냈으며 바르셀로나 현대미술관(MACBA) 소장품입니다.", credit: "© Guy Debord · MACBA(바르셀로나 현대미술관) 소장품 페이지 — 교육 목적 인용", link: "https://www.macba.cat/en/obra/r3779-guide-psychogeographique-de-paris-discours-sur-les-passions-de-lamour-pentes-psychogeographiques-de-la-derive-et-localisation-dunites-dambiance/" },
      ],
      links: [{ t: "MACBA 소장품 페이지", u: "https://www.macba.cat/en/obra/r3779-guide-psychogeographique-de-paris-discours-sur-les-passions-de-lamour-pentes-psychogeographiques-de-la-derive-et-localisation-dunites-dambiance/" }, { t: "Bureau of Public Secrets 「표류의 이론」 영역", u: "https://www.bopsecrets.org/SI/2.derive.htm" }, { t: "위키백과(영어) Dérive", u: "https://en.wikipedia.org/wiki/D%C3%A9rive" }],
    },
    fixed: {
      images: [
        { src: "/img/lessons/L2_w_t1_fixed_1.jpg", cap: "윌리엄 H. 화이트, 「작은 도시 공간의 사회적 삶」(1980)의 관찰 현장인 뉴욕 시그램 빌딩 광장(2025년 촬영). 화이트는 1970년대 스트리트 라이프 프로젝트에서 이 광장을 시간 경과 카메라로 기록하며 사람들이 어디에 앉고 얼마나 머무는지를 시간 표집으로 세었습니다.", credit: "위키미디어 공용 · CC BY-SA 4.0 · 사진 Epicgenius", link: "https://www.pps.org/article/wwhyte", srcPage: "https://commons.wikimedia.org/wiki/File:Seagram_Building_Nov_2025_22.jpg" },
        { src: "/img/lessons/L2_w_t1_fixed_2.jpg", cap: "윌리엄 H. 화이트, 「작은 도시 공간의 사회적 삶」(1980)에서 다룬 뉴욕 페일리 파크(2021년 촬영). 폭포 벽 앞에서 사람들이 옮길 수 있는 의자에 앉아 쉬는 모습으로, 화이트가 ‘앉을 자리’와 물·나무가 사람을 모으는 효과를 설명할 때 든 대표 사례입니다.", credit: "위키미디어 공용 · CC BY-SA 4.0 · 사진 Rhododendrites", link: "https://www.pps.org/article/wwhyte", srcPage: "https://commons.wikimedia.org/wiki/File:Paley_Park_(54035).jpg" },
      ],
      links: [{ t: "Project for Public Spaces — 윌리엄 H. 화이트", u: "https://www.pps.org/article/wwhyte" }, { t: "위키백과(영어) — 책·영화 항목", u: "https://en.wikipedia.org/wiki/The_Social_Life_of_Small_Urban_Spaces" }, { t: "위키백과(영어) — William H. Whyte", u: "https://en.wikipedia.org/wiki/William_H._Whyte" }],
    },
    map: {
      images: [
        { src: "/img/lessons/L2_w_t1_map.jpg", cap: "케빈 린치, 「인터뷰에서 언급된 곳, 보스턴(19건의 인터뷰)」(1954~1959). 『도시의 이미지』(1960)의 바탕이 된 MIT 보스턴 연구 ‘도시의 지각적 형태’에서 손으로 그린 채색 지도로, 시민 인터뷰에서 언급된 빈도(사분위)에 따라 길·가장자리·구역·결절점·랜드마크를 색을 달리해 표시했습니다. MIT 도서관 특별컬렉션(케빈 린치 페이퍼, MC 208) 소장.", credit: "© MIT 도서관 특별컬렉션(Kevin Lynch Papers, MC 208) · MIT DOME — 교육 목적 인용", link: "https://en.wikipedia.org/wiki/The_Image_of_the_City", srcPage: "https://dome.mit.edu/handle/1721.3/36506" },
      ],
      links: [{ t: "위키백과(영어) The Image of the City", u: "https://en.wikipedia.org/wiki/The_Image_of_the_City" }, { t: "MIT 도서관 DOME — Perceptual Form of the City", u: "https://dome.mit.edu/handle/1721.3/33656" }, { t: "위키백과(한국어) 케빈 A. 린치", u: "https://ko.wikipedia.org/wiki/%EC%BC%80%EB%B9%88_A._%EB%A6%B0%EC%B9%98" }],
    },
    inventory: {
      images: [
        { src: "/img/lessons/L2_w_t1_inventory_1.jpg", cap: "조르주 페렉, 「파리의 어느 장소에 대한 완전한 묘사 시도」(1975). 페렉은 1974년 10월 18일부터 사흘 동안 파리 생쉴피스 광장 8번지의 이 카페 드 라 메리(Café de la Mairie)를 비롯한 광장의 몇 자리에 앉아, 눈앞을 지나는 버스·비둘기·행인을 모두 적으려 했습니다(사진은 2022년 촬영).", credit: "위키미디어 공용 · CC BY-SA 4.0 · 사진 CVB", link: "https://fr.wikipedia.org/wiki/Tentative_d%27%C3%A9puisement_d%27un_lieu_parisien", srcPage: "https://commons.wikimedia.org/wiki/File:8_place_Saint-Sulpice_Paris.jpg" },
        { src: "/img/lessons/L2_w_t1_inventory_2.jpg", cap: "조르주 페렉, 「파리의 어느 장소에 대한 완전한 묘사 시도」(1975). 페렉이 사흘 동안 관찰한 생쉴피스 광장의 일상으로, 분수 가장자리와 성당 모퉁이, 오가는 행인과 비둘기가 보입니다 — 페렉은 이런 '아무 일도 일어나지 않을 때 일어나는 일'을 목록처럼 적었습니다(사진은 2012년 촬영).", credit: "위키미디어 공용 · CC BY 2.0 · 사진 Alexander Baranov", link: "https://fr.wikipedia.org/wiki/Tentative_d%27%C3%A9puisement_d%27un_lieu_parisien", srcPage: "https://commons.wikimedia.org/wiki/File:Paris_Place_Saint-Sulpice_20120512.jpg" },
        { src: "/img/lessons/L2_s27_3.jpg", cap: "마크 디온, 「테이트 템스 발굴」, 1999. 템스강 하안에서 수습한 도자기 파편·병·뼈 등을 17세기 ‘호기심의 방’ 형식의 양문형 목제 캐비닛에 분류해 넣었다. 테이트 소장.", credit: "테이트 소장 기록(T07669)", link: "https://www.tate.org.uk/art/artworks/dion-tate-thames-dig-t07669" },
      ],
      links: [{ t: "위키백과(프랑스어) — 작품 항목", u: "https://fr.wikipedia.org/wiki/Tentative_d%27%C3%A9puisement_d%27un_lieu_parisien" }, { t: "위키백과(영어) — An Attempt at Exhausting a Place in Paris", u: "https://en.wikipedia.org/wiki/An_Attempt_at_Exhausting_a_Place_in_Paris" }, { t: "위키백과(한국어) — 조르주 페렉", u: "https://ko.wikipedia.org/wiki/%EC%A1%B0%EB%A5%B4%EC%A3%BC_%ED%8E%98%EB%A0%89" }, { t: "마크 디온 「테이트 템스 발굴」(테이트)", u: "https://www.tate.org.uk/art/artworks/dion-tate-thames-dig-t07669" }],
    },
    sound: {
      images: [
        { src: "/img/lessons/L2_w_t1_sound_1.jpg", cap: "머레이 셰이퍼(R. Murray Schafer), 2007년 미국 애리조나 대학교에서 촬영한 사진입니다. 셰이퍼는 1970년대 사이먼프레이저 대학교에서 월드 사운드스케이프 프로젝트를 이끌고 『세계의 조율』(1977)을 펴내며 음향생태학의 기초를 놓은 캐나다 작곡가입니다.", credit: "위키미디어 공용 · CC BY-SA 3.0 · 사진 Eli n", link: "https://www.sfu.ca/~truax/wsp.html", srcPage: "https://commons.wikimedia.org/wiki/File:R._Murray_Schafer.jpg" },
        { src: "/img/lessons/L2_w_t1_sound_2.jpg", cap: "월드 사운드스케이프 프로젝트(WSP) 팀, 사이먼프레이저 대학교, 1973. 왼쪽부터 머레이 셰이퍼, 브루스 데이비스, 피터 휴스, 배리 트루악스, 하워드 브룸필드, 힐데가르트 베스터캄프입니다. 이 팀은 1970년대 캐나다와 유럽의 소리 환경을 현장 녹음하며 음향생태학 연구의 기초를 놓았습니다.", credit: "© Simon Fraser University / Barry Truax · SFU WSP 공식 페이지 — 교육 목적 인용", link: "https://www.sfu.ca/~truax/wsp.html" },
      ],
      links: [{ t: "SFU 월드 사운드스케이프 프로젝트", u: "https://www.sfu.ca/~truax/wsp.html" }, { t: "힐데가르트 베스터캄프 공식 — 「Soundwalking」(1974)", u: "https://www.hildegardwesterkamp.ca/writings/writings-by/?post_id=13&title=soundwalking" }, { t: "캐나다 백과사전 — R. Murray Schafer", u: "https://thecanadianencyclopedia.ca/en/article/r-murray-schafer" }],
    },
  },
  engage: {
    testimony: {
      images: [
        { src: "/img/lessons/L3_s32_2.jpg", cap: "임흥순, 「위로공단」(2014)의 홍보 스틸. 눈을 가린 인물이 공장 지대 옥상에 서 있고, 2015년 베네치아 비엔날레 은사자상 수상 표기가 함께 실려 있습니다.", credit: "「위로공단」 홍보 자료 (수업 자료 도판)", link: "https://ko.wikipedia.org/wiki/위로공단" },
      ],
      links: [{ t: "위키백과(한국어) 위로공단", u: "https://ko.wikipedia.org/wiki/위로공단" }],
    },
    indirect: {
      images: [
        { src: "/img/lessons/L3_s21_3.jpg", cap: "알프레도 자, 「구테테 에메리타의 눈」(1996)의 발광 텍스트 패널. 구테테 에메리타가 교회에서 가족이 살해되는 것을 목격한 상황을 서술한 글로, 관람자는 이 글을 읽은 뒤에야 그의 눈을 찍은 슬라이드와 만납니다.", credit: "작가 공식 사이트 alfredojaar.net", link: "https://alfredojaar.net/" },
        { src: "/img/lessons/L3_s19_3.jpg", cap: "알프레도 자, 「리얼 픽처스」(1995)의 설치 전경. 사진을 봉인한 검은 상자들이 쌓여 있고, 관람자는 상자 표면의 문장만 읽을 수 있습니다.", credit: "작가 공식 사이트·MoCP 전시 기록·로잔 주립미술관(MCBA) 소장 정보", link: "https://alfredojaar.net/" },
      ],
      links: [{ t: "작가 공식 사이트", u: "https://alfredojaar.net/" }],
    },
    archive: {
      images: [
        { src: "/img/lessons/L2_s27_3.jpg", cap: "마크 디온, 「테이트 템스 발굴」, 1999. 템스강 하안에서 수습한 도자기 파편·병·뼈 등을 17세기 ‘호기심의 방’ 형식의 양문형 목제 캐비닛에 분류해 넣었다. 테이트 소장.", credit: "테이트 소장 기록(T07669)", link: "https://www.tate.org.uk/art/artworks/dion-tate-thames-dig-t07669" },
      ],
      links: [{ t: "테이트 소장 「템스 발굴」", u: "https://www.tate.org.uk/art/artworks/dion-tate-thames-dig-t07669" }, { t: "마크 디온", u: "https://en.wikipedia.org/wiki/Mark_Dion" }],
    },
    parafiction: {
      images: [
        { src: "/img/lessons/L2_s33_3.jpg", cap: "호안 폰트쿠베르타·페레 포르미게라, 「파우나」, 1987. 박제 표본이 든 유리 진열장과 벽면의 사진·문서·노트가 자연사 박물관의 형식으로 설치된 전시 전경.", credit: "수업 자료 도판", link: "https://en.wikipedia.org/wiki/Joan_Fontcuberta" },
        { src: "/img/lessons/L2_s35_2.jpg", cap: "아틀라스 그룹 / 왈리드 라아드, 「사라진 레바논 전쟁」 노트북의 한 면. 경마 사진 둘레에 날짜, 기록, 역사학자들의 내기 내역이 주석처럼 달려 있다.", credit: "수업 자료 도판", link: "https://www.theatlasgroup1989.org/" },
      ],
      links: [{ t: "호안 폰트쿠베르타", u: "https://en.wikipedia.org/wiki/Joan_Fontcuberta" }, { t: "아틀라스 그룹 아카이브(공식)", u: "https://www.theatlasgroup1989.org/" }, { t: "파라픽션이란", u: "https://en.wikipedia.org/wiki/Parafiction" }],
    },
    forensic: {
      images: [
        { src: "/img/lessons/L3_s33_3.jpg", cap: "포렌식 아키텍처, 「그렌펠 타워 화재」 조사(2017~)의 3차원 모형 화면. 시민이 촬영한 영상과 사진을 시간·위치별로 정렬해 불길의 확산 경로를 재구성했습니다.", credit: "포렌식 아키텍처 공식 사이트 forensic-architecture.org", link: "https://forensic-architecture.org/" },
      ],
      links: [{ t: "포렌식 아키텍처(공식)", u: "https://forensic-architecture.org/" }],
    },
    institution: {
      images: [
        { src: "/img/lessons/L2_s11_3.jpg", cap: "「현대미술관, 독수리 부서」 전시 전경. 유리 진열장과 벽면에 시대와 지역이 서로 다른 독수리 도상들이 번호를 달고 진열되어 있다.", credit: "수업 자료 도판", link: "https://www.tate.org.uk/art/art-terms/i/institutional-critique" },
        { src: "/img/lessons/L2_s17_1.jpg", cap: "한스 하케, 「샤폴스키 외, 맨해튼 부동산 보유 현황」(1971)의 부분. 건물 정면 사진 아래에 소유·거래 내역을 타자기로 친 기록이 한 쌍을 이룬다.", credit: "수업 자료 도판", link: "https://en.wikipedia.org/wiki/Hans_Haacke" },
      ],
      links: [{ t: "마르셀 브로타에스", u: "https://en.wikipedia.org/wiki/Marcel_Broodthaers" }, { t: "한스 하케", u: "https://en.wikipedia.org/wiki/Hans_Haacke" }, { t: "제도비평이란(테이트)", u: "https://www.tate.org.uk/art/art-terms/i/institutional-critique" }],
    },
    intervene: {
      images: [
        { src: "/img/lessons/L3_w_wodiczko.jpg", cap: "크지슈토프 보디치코, 「홈리스 프로젝션: 플라스 데자르」(2014). 몬트리올 비엔날레(BNLMTL 2014) 기간에 플라스 데자르의 메종뇌브 극장 정면 층계형 난간 위로 그 도시 노숙인들의 모습과 목소리를 영상으로 투사한 공공 프로젝션으로, 1980년부터 이어진 건물·기념비 프로젝션 연작의 하나입니다.", credit: "위키미디어 공용 · CC BY 2.0 · 사진 art_inthecity (Flickr)", link: "https://act.mit.edu/about/people/krzysztof-wodiczko/", srcPage: "https://commons.wikimedia.org/wiki/File:Krzysztof_Wodiczko,_Homeless_Projection,_2014_(15730201502).jpg" },
        { src: "/img/lessons/L3_s30_3.jpg", cap: "크지슈토프 보디치코, 「노숙자 차량 프로젝트」(1988~89)의 전시 설치 전경. 주황색 덮개가 달린 실물 손수레 뒤로 당시 뉴욕 거리의 사진과 설계 도면들이 걸려 있습니다.", credit: "허시혼 미술관(HMSG 2017.010) 소장 기록 (수업 자료 도판)", link: "https://en.wikipedia.org/wiki/Krzysztof_Wodiczko" },
      ],
      links: [{ t: "MIT ACT — 작가 소개", u: "https://act.mit.edu/about/people/krzysztof-wodiczko/" }, { t: "허시혼 미술관 — 1988년 프로젝션 재상영 보도자료", u: "https://hirshhorn.si.edu/news/press-release/hirshhorn-to-restage-krzysztof-wodiczko-projection-on-museum-exterior" }, { t: "위키백과(영어)", u: "https://en.wikipedia.org/wiki/Krzysztof_Wodiczko" }],
    },
    relational: {
      images: [
        { src: "/img/lessons/L3_w_beuys_1.jpg", cap: "요제프 보이스, 「7000그루의 참나무 — 도시 행정 대신 도시 숲 가꾸기」(1982–87). 카셀 프리데리치아눔 정면 잔디밭의 참나무 두 그루와 밑동의 현무암 기둥으로, 오른쪽은 1982년 보이스가 도쿠멘타 7을 위해 처음 심은 나무, 왼쪽은 1987년 아들 벤첼이 심은 마지막 나무이며, 나무마다 현무암 기둥 하나를 짝지어 세운 이 사업은 시민이 함께 만드는 ‘사회적 조각’의 대표 사례입니다.", credit: "위키미디어 공용 · CC BY-SA 4.0 · 사진 Codc", link: "https://www.7000eichen.de/", srcPage: "https://commons.wikimedia.org/wiki/File:7000_Eichen_vor_Fridericianum.jpg" },
        { src: "/img/lessons/L3_w_beuys_2.jpg", cap: "요제프 보이스, 「7000그루의 참나무」(1982–87) 기록 사진, 1982년 6월. 도쿠멘타 7 개막 무렵 프리데리치아눔 앞에 현무암 기둥 7,000개를 쌓아 시작한 더미로, 나무 한 그루가 심길 때마다 돌 하나를 옮겨 세워 더미가 조금씩 줄어들도록 했으며, 건물 프리즈의 글귀는 로렌스 위너의 작품입니다.", credit: "위키미디어 공용 · CC BY-SA 2.5 · 사진 J. Bunse", link: "https://www.7000eichen.de/", srcPage: "https://commons.wikimedia.org/wiki/File:Documenta_7_Beuys_Weiner_Fridericianum_1982.jpg" },
      ],
      links: [{ t: "7000 Eichen 공식 사이트(독일어)", u: "https://www.7000eichen.de/" }, { t: "테이트 미술 용어 ‘사회적 조각’", u: "https://www.tate.org.uk/art/art-terms/s/social-sculpture" }, { t: "위키백과(한국어) 사회적 조각", u: "https://ko.wikipedia.org/wiki/%EC%82%AC%ED%9A%8C%EC%A0%81_%EC%A1%B0%EA%B0%81" }, { t: "관계미학(위키백과 영어)", u: "https://en.wikipedia.org/wiki/Relational_art" }],
    },
  },
};

/* 카드를 고르면 펼쳐지는 상세 안에서 출처 문구 바로 아래에 놓는다 */
export function CardMedia({ src, k }) {
  const group = CARD_MEDIA[src === "obs" ? "obs" : "engage"];
  const m = group && group[k];
  if (!m) return null;
  return (
    <div className="pc-media">
      <LessonImages images={m.images} />
      <WorkLinks links={m.links} />
    </div>
  );
}

export const CardMediaStyle = () => (
  <style>{`
.pc-media{margin:4px 0 10px}
.pc-media .lz-figs{gap:10px;margin:2px 0 6px}
.pc-media .lz-fig{flex:1 1 200px;max-width:340px}
.pc-media .lz-fig figcaption{font-size:11px}
.pc-media .wk-links{margin-top:2px}
`}</style>
);
