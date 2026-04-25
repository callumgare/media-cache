export async function ensureGroup(pathNamesFlat) {
  const pathNames = unflattenPathNames(pathNamesFlat)

  let currentParent = null
  let group
  for (let name of ["", ...pathNames]) {
    const creatingGroup = !await Group.findOne({ name, parents: currentParent})
    group = await Group.findOneAndUpdate({
      name,
      parents: currentParent
    }, {
      $setOnInsert: {
        name,
        parents: [currentParent]
      }
    }, {
      new: true,
      upsert: true,
      runValidators: true
    })
    if (creatingGroup) {
      // Update the children in the current parent
      await Group.synchronize({_id: currentParent})
    }
    currentParent = group._id
  }
  return group
}