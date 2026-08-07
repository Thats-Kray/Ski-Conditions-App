export default function HeroBannerStrip({ photoPath, height = 130 }) {
  return (
    <div
      style={{
        width: "100vw",
        marginLeft: "calc(50% - 50vw)",
        marginRight: "calc(50% - 50vw)",
        height,
        marginBottom: 20,
        background: `linear-gradient(to top, rgba(4,8,15,0.4), rgba(2,6,23,0.05)), url(${photoPath}) center/cover`,
      }}
    />
  )
}
