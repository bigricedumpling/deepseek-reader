import {PhFileText,PhBookOpen,PhGraduationCap,PhLightbulb,PhFlask,PhCode,PhPencilLine,PhFlower,PhFolder,PhCompass,PhStar,PhNotebook,PhBriefcase,PhPalette,PhPlanet,PhCamera,PhMusicNotes,PhLeaf,PhHouse,PhArchive,PhChalkboard,PhStudent,PhGraph,PhCube,PhShapes,PhChatCircle,PhTerminal,PhFilePdf,PhMagnifyingGlass,PhBookmarks,PhMapTrifold,PhRocket,PhCheckSquare} from '@phosphor-icons/vue'
export const iconNames={file:PhFileText,book:PhBookOpen,graduate:PhGraduationCap,idea:PhLightbulb,flask:PhFlask,code:PhCode,pencil:PhPencilLine,flower:PhFlower,folder:PhFolder,compass:PhCompass,star:PhStar,notebook:PhNotebook,briefcase:PhBriefcase,palette:PhPalette,planet:PhPlanet,camera:PhCamera,music:PhMusicNotes,leaf:PhLeaf,house:PhHouse,archive:PhArchive,class:PhChalkboard,student:PhStudent,graph:PhGraph,cube:PhCube,shapes:PhShapes,chat:PhChatCircle,terminal:PhTerminal,pdf:PhFilePdf,search:PhMagnifyingGlass,bookmarks:PhBookmarks,map:PhMapTrifold,rocket:PhRocket,check:PhCheckSquare}
const labels='文档 书籍 毕业 灵感 实验 代码 写作 花朵 文件夹 方向 星星 笔记 工作 艺术 星球 摄影 音乐 自然 首页 归档 课堂 学生 图谱 方块 图形 交流 终端 PDF 搜索 收藏 地图 项目 验证'.split(' ')
export const lineIcons=Object.keys(iconNames).map((k,i)=>({value:'icon:'+k,label:labels[i]+' '+k,category:'图标'}))
export const emojiGroups=[
 ['学习与工作','📚 📖 📝 📓 📔 📒 📕 📗 📘 📙 🎓 🏫 💼 🗂️ 📁 📂 📋 📌 📍 🔖 🗒️ ✏️ 🖋️ 🔍 💡 🧠 🧪 🔬 🔭 💻 ⌨️ 🖥️ 📐 📏 🧮 🗃️'],
 ['表情与人物','😀 😃 😄 😁 😆 😊 🙂 😉 😌 😍 🥰 😎 🤓 🧐 🤔 🤩 🥳 😴 🤖 👻 👽 🙌 👋 👍 👏 🤝 ✌️ 🫶 👀 🧑‍🎨 🧑‍💻 🧑‍🎓'],
 ['自然与生活','🌱 🌿 🍃 🌳 🌵 🌴 🌷 🌸 🌼 🌻 🍀 🍂 🍁 🌊 ☀️ 🌙 ⭐ ✨ 🌈 ☁️ 🪐 🌍 🐈 🐕 🦊 🐼 🐰 🦋 🐝 🐢 🍎 🍊 🍋 🍇 🍓 🥑 ☕ 🍵 🍰 🥐'],
 ['兴趣与出行','🎨 🖌️ 🎭 🎬 🎥 📷 🎵 🎶 🎹 🎸 🎧 🎮 🧩 🎲 🏀 ⚽ 🎾 🏓 🛹 🚲 🚗 🚀 ✈️ 🧭 🗺️ 🏠 🏔️ 🏕️ 🏖️ 🏛️ 🏰'],
 ['符号与物品','❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💬 🔔 🔑 🔒 🔓 ⚙️ 🛠️ 🧰 📦 🎁 🎯 🏆 🥇 ✅ ☑️ ✔️ ➕ ➖ ➡️ 🔴 🟠 🟡 🟢 🔵 🟣 ⚪ ⚫ 🔶 🔷']
].map(([name,values])=>({name,items:values.split(' ').map(value=>({value,label:name+' '+value,category:name}))}))
export const randomIcon=()=>{const items=emojiGroups[0].items;return items[Math.floor(Math.random()*items.length)].value}
